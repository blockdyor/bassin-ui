import { Fragment } from 'react';
import { Segment } from '../helpers/convert';

interface FormattedValueProps {
    segments: Segment[];
}

/**
 * Renders the output of convert.ts helpers (hashrateSuffix, abbreviateNumber,
 * secondsToDHM, diffToNowDHM, formatTime) as plain React text.
 * Replaces the old dangerouslySetInnerHTML + createMarkup pattern, so nothing
 * here can ever be interpreted as HTML, no matter what the data contains.
 */
export default function FormattedValue({ segments }: FormattedValueProps) {
    return (
        <>
            {segments.map((segment, index) =>
                segment.sub ? (
                    <span key={index}>{segment.text}</span>
                ) : (
                    <Fragment key={index}>{segment.text}</Fragment>
                )
            )}
        </>
    );
}