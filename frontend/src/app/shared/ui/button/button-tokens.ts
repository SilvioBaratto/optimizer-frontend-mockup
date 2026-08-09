/**
 * The one definition of what a button looks like.
 *
 * Shared by `ButtonComponent`, which renders its own `<button>`, and
 * `ButtonDirective`, which styles a `<button>` the caller already wrote. The
 * pages use the directive: their buttons carry layout classes (`ml-auto`,
 * `self-start`, `w-full`) and a wrapper element would take those off the
 * button and put them on a box around it.
 *
 * Values follow the pages rather than the other way round — these are the
 * tokens the 24 product pages had already settled on.
 */
export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'danger-outline';
export type ButtonSize = 'xs' | 'sm' | 'md' | 'lg';

export const BUTTON_BASE =
  'inline-flex min-h-11 items-center justify-center rounded-md text-sm font-medium ' +
  'transition-colors disabled:opacity-50';

export const BUTTON_VARIANT: Record<ButtonVariant, string> = {
  primary: 'bg-primary text-on-primary hover:bg-primary-hover',
  /** Transparent, so it reads as the quieter choice beside a primary. */
  secondary: 'border border-border-control text-text hover:bg-surface-inset',
  /** Accent-tinted rather than neutral: the pages use it for in-place actions. */
  ghost: 'bg-transparent text-primary hover:bg-primary-light',
  danger: 'bg-danger text-white hover:opacity-90',
  'danger-outline': 'border border-danger text-danger hover:bg-surface-inset',
};

export const BUTTON_SIZE: Record<ButtonSize, string> = {
  xs: 'px-2',
  sm: 'px-3',
  md: 'px-4',
  lg: 'px-6',
};

export function buttonClasses(variant: ButtonVariant, size: ButtonSize): string {
  return `${BUTTON_BASE} ${BUTTON_VARIANT[variant]} ${BUTTON_SIZE[size]}`;
}
