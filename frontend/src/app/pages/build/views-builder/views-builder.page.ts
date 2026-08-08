import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';

import { ActionButtonRow } from '../../../shared/action-button-row/action-button-row';
import { ConfirmDialog } from '../../../shared/confirm-dialog/confirm-dialog';
import { EmptyState } from '../../../shared/empty-state/empty-state';
import { InfoCard } from '../../../shared/info-card/info-card';
import { SkeletonBlock } from '../../../shared/skeleton-block/skeleton-block';
import { StatusBadge, type StatusTone } from '../../../shared/status-badge/status-badge';
import { StatusBanner, type BannerVariant } from '../../../shared/status-banner/status-banner';
import type { InvestorView, ViewStatus, ViewType } from '../../../models/macro-view.model';
import { MAX_VIEWS, VIEW_ASSETS, ViewsService, statusOf } from '../../../services/views.service';
import { StepTracker } from '../step-tracker/step-tracker';

const STATUS_TONE: Record<ViewStatus, StatusTone> = {
  complete: 'ok',
  incomplete: 'warn',
  invalid: 'alert',
};

/** Draft held by the inline editor, separate from the saved list. */
interface ViewDraft {
  type: ViewType;
  asset: string | null;
  againstAsset: string | null;
  q: number | null;
  omega: number | null;
}

const BLANK_DRAFT: ViewDraft = {
  type: 'absolute',
  asset: VIEW_ASSETS[0],
  againstAsset: null,
  q: null,
  omega: null,
};

/**
 * `docs/05 Views Builder.md` — step 3 of the Build flow.
 *
 * Expresses the investor's views against market equilibrium and shows what
 * they do to the posterior. Views come in exactly two shapes, absolute and
 * relative, because those are the only two the theory admits.
 *
 * The posterior (r_BL, x_BL, V_BL) is computed behind the API. P and Ω are
 * assembled here, which is not an exception to that rule: they are a
 * rearrangement of what the user typed into matrix form, not an estimate.
 *
 * The page renders no `<h1>` — the shell renders it from the route.
 */
@Component({
  selector: 'app-views-builder',
  imports: [
    ActionButtonRow,
    ConfirmDialog,
    EmptyState,
    InfoCard,
    SkeletonBlock,
    StatusBadge,
    StatusBanner,
    StepTracker,
  ],
  templateUrl: './views-builder.page.html',
  styleUrl: './views-builder.page.css',
  host: { class: 'flex flex-col gap-6' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ViewsBuilderPage {
  private readonly service = inject(ViewsService);

  protected readonly assets = VIEW_ASSETS;
  protected readonly maxViews = MAX_VIEWS;

  protected readonly views = this.service.views;
  protected readonly result = this.service.result;
  protected readonly saving = this.service.saving;
  protected readonly loading = this.service.loading;
  protected readonly isDirty = this.service.isDirty;
  protected readonly hasInvalid = this.service.hasInvalid;
  protected readonly atCapacity = this.service.atCapacity;
  protected readonly contributing = this.service.contributing;
  protected readonly riskAversion = this.service.riskAversion;

  // --- local UI state -----------------------------------------------------
  protected readonly tau = signal(0.05);
  protected readonly editorOpen = signal(false);
  /** Id being edited; null means the editor is adding a new view. */
  protected readonly editingId = signal<string | null>(null);
  protected readonly draft = signal<ViewDraft>({ ...BLANK_DRAFT });
  protected readonly banner = signal<{ variant: BannerVariant; message: string } | null>(null);
  protected readonly confirmDeleteId = signal<string | null>(null);
  protected readonly confirmDiscard = signal(false);
  protected readonly showPMatrix = signal(true);
  protected readonly showOmegaMatrix = signal(true);
  /** Collapsed by default, per the spec. */
  protected readonly showUncertainty = signal(false);
  protected readonly announcement = signal('');

  protected readonly viewCount = computed(() => this.views().length);

  /** Save is blocked with nothing pending, or while any view is unusable. */
  protected readonly canSave = computed(
    () => this.isDirty() && !this.hasInvalid() && !this.saving(),
  );

  /** The editor's own validity, independent of the saved list. */
  protected readonly draftValid = computed(() => {
    const d = this.draft();
    if (!d.asset || d.q === null || d.omega === null || d.omega <= 0) return false;
    if (d.type === 'relative') return Boolean(d.againstAsset) && d.againstAsset !== d.asset;
    return true;
  });

  /**
   * P (K×N): one row per contributing view, +1 on the asset held long and −1
   * on the short leg of a relative view.
   */
  protected readonly pMatrix = computed(() =>
    this.contributing().map((view) =>
      this.assets.map((asset) => {
        if (asset === view.asset) return 1;
        if (view.type === 'relative' && asset === view.againstAsset) return -1;
        return 0;
      }),
    ),
  );

  /** Ω (K×K): diagonal of the contributing views' variances. */
  protected readonly omegaMatrix = computed(() => {
    const rows = this.contributing();
    return rows.map((view, i) => rows.map((_, j) => (i === j ? (view.omega ?? 0) : 0)));
  });

  protected readonly contributingLabels = computed(() =>
    this.contributing().map((_, i) => `View ${i + 1}`),
  );

  // --- interactions -------------------------------------------------------

  protected statusOf(view: InvestorView): ViewStatus {
    return statusOf(view);
  }

  protected statusTone(status: ViewStatus): StatusTone {
    return STATUS_TONE[status];
  }

  /** Human-readable form of the view, used in labels and on the card. */
  protected expression(view: InvestorView): string {
    if (view.type === 'relative') {
      return `${view.asset ?? '—'} − ${view.againstAsset ?? '—'}`;
    }
    return view.asset ?? '—';
  }

  protected openAdd(): void {
    this.editingId.set(null);
    this.draft.set({ ...BLANK_DRAFT });
    this.editorOpen.set(true);
  }

  protected openEdit(view: InvestorView): void {
    this.editingId.set(view.id);
    this.draft.set({
      type: view.type,
      asset: view.asset,
      againstAsset: view.againstAsset,
      q: view.q,
      omega: view.omega,
    });
    this.editorOpen.set(true);
  }

  protected cancelEditor(): void {
    // Discards only the view being edited; the others are untouched.
    this.editorOpen.set(false);
    this.editingId.set(null);
  }

  protected commitDraft(): void {
    if (!this.draftValid()) return;
    const d = this.draft();
    const payload = {
      type: d.type,
      asset: d.asset,
      againstAsset: d.type === 'relative' ? d.againstAsset : null,
      q: d.q,
      omega: d.omega,
    };

    const id = this.editingId();
    if (id) {
      this.service.update(id, payload);
      this.announcement.set('View updated. Posterior recalculated.');
    } else {
      this.service.add(payload);
      this.announcement.set('View added. Posterior recalculated.');
    }
    this.editorOpen.set(false);
    this.editingId.set(null);
  }

  protected setType(type: ViewType): void {
    // Switching to absolute drops the second leg rather than keeping it hidden.
    this.draft.update((d) => ({ ...d, type, againstAsset: type === 'relative' ? d.againstAsset : null }));
  }

  protected setDraftField<K extends keyof ViewDraft>(key: K, value: ViewDraft[K]): void {
    this.draft.update((d) => ({ ...d, [key]: value }));
  }

  protected onDraftNumber(event: Event, key: 'q' | 'omega'): void {
    const raw = (event.target as HTMLInputElement).value;
    this.setDraftField(key, raw === '' ? null : Number(raw));
  }

  protected confirmDelete(): void {
    const id = this.confirmDeleteId();
    if (!id) return;
    this.service.remove(id);
    this.confirmDeleteId.set(null);
    this.announcement.set('View deleted. Posterior recalculated.');
  }

  protected async save(): Promise<void> {
    this.banner.set(null);
    const ok = await this.service.save();
    this.banner.set(
      ok
        ? { variant: 'success', message: 'Views saved' }
        : {
            variant: 'error',
            message: 'Save failed: the views could not be written to the pipeline.',
          },
    );
  }

  protected discard(): void {
    this.service.discard();
    this.confirmDiscard.set(false);
    this.announcement.set('Unsaved changes discarded.');
  }

  protected requestDiscard(): void {
    if (this.isDirty()) this.confirmDiscard.set(true);
  }

  protected onTau(event: Event): void {
    const value = Number((event.target as HTMLInputElement).value);
    if (value > 0) this.tau.set(value);
  }

  /** Explicit sign, so the delta never depends on colour alone. */
  protected delta(prior: number, posterior: number): string {
    const d = posterior - prior;
    return `${d >= 0 ? '+' : '−'}${Math.abs(d).toFixed(2)}`;
  }
}
