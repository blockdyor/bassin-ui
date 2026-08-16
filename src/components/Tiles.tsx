import './Tiles.scss';
import Metric from './Metric';
import { Tooltip } from './Tooltip';
import { abbreviateNumber, diffToNowDHM, hashrateSuffix, secondsToDHM } from '../helpers/convert';
import { Pool } from '../interfaces/pool';

interface TilesProps {
	pool: Pool
}

export default function Tiles({ pool }: TilesProps) {
	return (
		<div className="tiles">
			<section className="tile">
				<h3 className="tile-headline font-barlow">Hashrate</h3>

				<ul className="tile-items">
					<li className="tile-item">
						<Metric label={'5 Minutes'} headline={hashrateSuffix(pool.hashrate5m)} />
					</li>
					<li className="tile-item">
						<Metric label={'1 Hour'} headline={hashrateSuffix(pool.hashrate1hr)} />
					</li>
					<li className="tile-item">
						<Metric label={'1 Day'} headline={hashrateSuffix(pool.hashrate1d)} />
					</li>
					<li className="tile-item">
						<Metric label={'1 Week'} headline={hashrateSuffix(pool.hashrate7d)} />
					</li>
				</ul>
			</section>

			<section className="tile">
				<h3 className="tile-headline font-barlow">Shares</h3>

				<ul className="tile-items">
					<li className="tile-item">
						<Metric label={'Best'} headline={abbreviateNumber(pool.bestshare)} />
					</li>
					<li className="tile-item">
						<Metric label={'/Second'} headline={[{ text: pool.SPS1m.toFixed(4) }]} />
					</li>
					<li className="tile-item">
						<Metric label={'Accepted'} headline={abbreviateNumber(pool.accepted)} />
					</li>
					<li className="tile-item">
						<Metric label={'Rejected'} headline={abbreviateNumber(pool.rejected)} />
					</li>
				</ul>
			</section>

			<section className="tile">
				<h3 className="tile-headline font-barlow">Info</h3>

				<ul className="tile-items">
					<li className="tile-item">
						<Metric label={'Uptime'} headline={secondsToDHM(pool.runtime)} />
					</li>
					<li className="tile-item">
						<Metric label={'User'} headline={[{ text: pool.Users.toString() }]} />
					</li>
					<li className="tile-item tile-item--has-tooltip">
						<Tooltip text={new Date(pool.lastupdate * 1000).toISOString().replace('T', ' ').slice(0, 19) + ' UTC'}>
							<div style={{ cursor: 'help' }}>
								<Metric label={'Update'} headline={diffToNowDHM(pool.lastupdate)} />
							</div>
						</Tooltip>
					</li>
					<li className="tile-item">
						<Metric label={'Workers'} headline={[{ text: pool.Workers.toString() }]} />
					</li>
				</ul>
			</section>
		</div>
	);
}