/**
 * A small piece of formatted output.
 * `sub: true` means "render this smaller, as a unit/suffix" (was previously a <span>).
 * Components render these directly as text, nothing here ever becomes raw HTML.
 */
export interface Segment {
    text: string;
    sub?: boolean;
}

export const parseHashrate = (value: string): number => {
    if (!value) return 0;

    const units: { [key: string]: number } = {
        H: 1,
        K: 1e3,
        M: 1e6,
        G: 1e9,
        T: 1e12,
        P: 1e15,
        E: 1e18,
        Z: 1e21,
        Y: 1e24,
    };

    const match = value.trim().match(/^([\d.,]+)\s*([KMGTPEZY]?)[H]?\b/i);

    if (!match) return NaN;

    const numericPart = parseFloat(match[1].replace(',', '.'));
    const unit = match[2].toUpperCase();
    const multiplier = units[unit] || 1;

    return numericPart * multiplier;
}

export const abbreviateNumber = (value: number, symbolSuffix: string = ''): Segment[] => {
    const units = [
        { limit: 1e15, symbol: 'P' },
        { limit: 1e12, symbol: 'T' },
        { limit: 1e9, symbol: 'G' },
        { limit: 1e6, symbol: 'M' },
        { limit: 1e3, symbol: 'K' },
    ];

    const format = (num: number) => {
        if (Number.isInteger(num)) {
            return num.toString();
        }
        return num.toFixed(2);
    };

    for (const { limit, symbol } of units) {
        if (value >= limit) {
            return [
                { text: format(value / limit) },
                { text: `${symbol}${symbolSuffix}`, sub: true },
            ];
        }
    }

    return symbolSuffix
        ? [{ text: format(value) }, { text: symbolSuffix, sub: true }]
        : [{ text: format(value) }];
};

/**
 * Same as abbreviateNumber, but joined into one plain string.
 * For places that need plain text (tooltips, alt text), not JSX.
 */
export const abbreviateNumberPlain = (value: number, symbolSuffix: string = ''): string => {
    return abbreviateNumber(value, symbolSuffix)
        .map((segment) => segment.text)
        .join(' ');
};

export const hashrateSuffix = (value: string): Segment[] => {
    return abbreviateNumber(parseHashrate(value), 'h/s');
}

export const secondsToDHM = (s: number): Segment[] => {
    const days = Math.floor(s / 86400);
    const hours = Math.floor((s % 86400) / 3600);
    const minutes = Math.floor((s % 3600) / 60);

    if (days) {
        return [
            { text: `${days}` }, { text: 'd', sub: true },
            { text: ` ${hours}` }, { text: 'h', sub: true },
        ];
    } else if (hours) {
        return [
            { text: `${hours}` }, { text: 'h', sub: true },
            { text: ` ${minutes}` }, { text: 'm', sub: true },
        ];
    } else {
        return [{ text: `${minutes}` }, { text: 'm', sub: true }];
    }
}

export const diffToNowDHM = (timestamp: number): Segment[] => {
    const diffTime = Math.floor(Date.now() / 1000) - timestamp;

    if (diffTime <= 60) {
        return [{ text: 'now' }];
    }

    return [...secondsToDHM(diffTime), { text: ' ago', sub: true }];
}

export const formatTime = (timestamp: number): Segment[] => {
    const formatted = new Date(timestamp).toLocaleTimeString();
    const match = formatted.match(/^(.*?)\s?(AM|PM)$/);

    if (!match) {
        return [{ text: formatted }];
    }

    return [{ text: match[1] }, { text: match[2], sub: true }];
}