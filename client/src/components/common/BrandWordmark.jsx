/**
 * ParkHere wordmark: "Park" (sky gradient) + "Here" (amber gradient).
 * Use variant "dark" on light backgrounds (readable park gradient).
 */
export default function BrandWordmark({ size = 'md', className = '', variant = 'light' }) {
    const sizes = {
        sm: { wrap: 'text-base font-bold tracking-tight', park: '', here: '' },
        md: { wrap: 'text-lg font-bold tracking-tight', park: '', here: '' },
        lg: { wrap: 'text-2xl sm:text-3xl font-extrabold tracking-tight gap-1', park: '', here: '' },
        xl: { wrap: 'text-3xl sm:text-4xl font-extrabold tracking-tight', park: '', here: '' },
    };
    const s = sizes[size] || sizes.md;
    const parkClass =
        variant === 'dark'
            ? 'text-gradient-park-on-light'
            : 'text-gradient-park';

    return (
        <span className={`inline-flex items-baseline gap-0 ${s.wrap} ${className}`.trim()}>
            <span className={parkClass}>Park</span>
            <span className="text-gradient-here">Here</span>
        </span>
    );
}
