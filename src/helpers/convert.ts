export const hashrateSuffix = (value: string): string => {
    return abbreviateNumber(parseHashrate(value), true, 'h/s');
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

export const abbreviateNumber = (value: number, withMarkup: boolean = true, symbolSuffix: string = ''): string => {
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
            const formatted = format(value / limit);
            return formatted + (withMarkup ? `<span>${symbol}${symbolSuffix}</span>` : ` ${symbol}${symbolSuffix}`);
        }
    }

    return format(value);
};

export const secondsToDHM = (s: number): string => {
    const days = Math.floor(s / 86400);
    const hours = Math.floor((s % 86400) / 3600);
    const minutes = Math.floor((s % 3600) / 60);

    if (days) {
        return `${days}<span>d</span> ${hours}<span>h</span>`;
    } else if (hours) {
        return `${hours}<span>h</span> ${minutes}<span>m</span>`;
    } else {
        return `${minutes}<span>m</span>`;
    }
}

export const diffToNowDHM = (timestamp: number): string => {
    const diffTime = Math.floor(Date.now() / 1000) - timestamp;

    return diffTime > 60 ? `${secondsToDHM(diffTime)} <span>ago</span>` : 'now';
}

export const formatTime = (timestamp: number): string => {
    return new Date(timestamp).toLocaleTimeString()
        .replace(/\s?(AM|PM)/, (_, meridiem) => `<span>${meridiem}</span>`);
}

export function createMarkup(dirty: string) {
    return { __html: dirty };
}