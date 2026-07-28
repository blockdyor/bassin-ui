import './Stepper.scss';
import { useState } from 'react';
import { BASSIN_STRATUM_PORT } from '../helpers/constants';

interface StepperProps {
    step: number;
}

export default function Stepper({ step }: StepperProps) {
    const stratumHost = `${window.location.hostname}:${BASSIN_STRATUM_PORT}`;
    const [copied, setCopied] = useState(false);

    const copyStratumAddress = async () => {
        try {
            if (navigator.clipboard?.writeText) {
                await navigator.clipboard.writeText(stratumHost);
            } else {
                const textarea = document.createElement('textarea');
                textarea.value = stratumHost;
                textarea.setAttribute('readonly', '');
                textarea.style.position = 'fixed';
                textarea.style.left = '-9999px';
                document.body.appendChild(textarea);
                textarea.select();
                document.execCommand('copy');
                document.body.removeChild(textarea);
            }

            setCopied(true);
            window.setTimeout(() => setCopied(false), 1200);
        } catch (error) {
            console.error('Failed to copy stratum address', error);
        }
    };

    return (
        <div className='stepper' data-step={step}>
            <ul className="steps">
                <li>
                    <span>Node</span>
                    <hr />
                </li>
                <li>
                    <span>Miner</span>
                </li>
            </ul>

            <ul className="panel">
                <li>
                    <h3 className='font-barlow'>Connecting Node ...</h3>
                    <p>
                        Ensure that your Bitcoin Node is running and fully synced.
                    </p>
                </li>
                <li>
                    <h3 className='font-barlow'>Awaiting Shares ...</h3>
                    <table>
                        <tbody>
                            <tr>
                                <td>Host</td>
                                <td className="stratum-host-row">
                                    <code>{stratumHost}</code>
                                    <button
                                        type="button"
                                        className="copy-button"
                                        aria-label={copied ? 'Copied stratum address' : 'Copy stratum address'}
                                        title={copied ? 'Copied' : 'Copy stratum address'}
                                        onClick={copyStratumAddress}
                                    >
                                        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                                            {copied ? (
                                                <path d="M9 16.17 4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
                                            ) : (
                                                <path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z" />
                                            )}
                                        </svg>
                                    </button>
                                </td>
                            </tr>
                            <tr>
								<td>Username</td>
								<td><code>&lt;btcaddress&gt;.&lt;worker&gt;</code></td>
							</tr>
							<tr>
								<td>Password</td>
								<td><code>x</code></td>
							</tr>
						</tbody>
					</table>
                </li>
            </ul>
        </div>
    );
};
