import './Chart.scss';
import React from 'react';
import { abbreviateNumberPlain } from '../helpers/convert';
import { Tooltip } from './Tooltip';

interface ChartProps {
    chart: number[]
}

export default function Chart({ chart }: ChartProps) {
    const maxHashrate = Math.max(...chart);

    return (
        <div className='chart'>
            <ul>
                {chart.map((currentValue, index) => {
                    const previousValue = index > 0 ? chart[index - 1] : null;
                    const start = previousValue ? previousValue / maxHashrate : 0;
                    const end = currentValue ? currentValue / maxHashrate : 0;

                    return (
                        <Tooltip key={index} text={abbreviateNumberPlain(currentValue, 'h/s')}>
                            <li

                                style={{
                                    '--start': start,
                                    '--end': end,
                                } as React.CSSProperties}
                            />
                        </Tooltip>
                    );
                })}
            </ul>

            {chart.length === 1 && <small>Preparing 5 Minutes Hashrate Chart ...</small>}
        </div>
    );
};