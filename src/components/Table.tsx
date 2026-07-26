import './Table.scss';
import { Worker, User } from '../interfaces/users';
import { hashrateSuffix, abbreviateNumber, diffToNowDHM } from '../helpers/convert';
import FormattedValue from './FormattedValue';

interface TableProps {
    user: User
}

export default function Table({ user }: TableProps) {
    return (
        <table>
            <thead>
                <tr>
                    <th scope="col"></th>
                    <th scope="col" colSpan={4} className='font-barlow'>Hashrate</th>
                    <th scope="col"></th>
                    <th scope="col" colSpan={4} className='font-barlow'>Shares</th>
                </tr>
                <tr>
                    <th scope="col">Worker</th>
                    <th scope="col">5 Minutes</th>
                    <th scope="col">1 Hour</th>
                    <th scope="col">1 Day</th>
                    <th scope="col">1 Week</th>
                    <th scope="col"></th>
                    <th scope="col">↓ Best</th>
                    <th scope="col">Best Ever</th>
                    <th scope="col">Total</th>
                    <th scope="col">Last</th>
                </tr>
            </thead>

            <tbody>
                {user.worker.sort((a, b) => b.bestshare - a.bestshare).map((worker: Worker) => (
                    <tr key={worker.workername}>
                        <td scope="row">{worker.workername.split('.').pop()}</td>
                        <td><FormattedValue segments={hashrateSuffix(worker.hashrate5m)} /></td>
                        <td><FormattedValue segments={hashrateSuffix(worker.hashrate1hr)} /></td>
                        <td><FormattedValue segments={hashrateSuffix(worker.hashrate1d)} /></td>
                        <td><FormattedValue segments={hashrateSuffix(worker.hashrate7d)} /></td>
                        <td></td>
                        <td><FormattedValue segments={abbreviateNumber(worker.bestshare)} /></td>
                        <td><FormattedValue segments={abbreviateNumber(worker.bestever)} /></td>
                        <td><FormattedValue segments={abbreviateNumber(worker.shares)} /></td>
                        <td><FormattedValue segments={diffToNowDHM(worker.lastshare)} /></td>
                    </tr>
                ))}

                <tr>
                    <td scope="row"></td>
                    <td><FormattedValue segments={hashrateSuffix(user.hashrate5m)} /></td>
                    <td><FormattedValue segments={hashrateSuffix(user.hashrate1hr)} /></td>
                    <td><FormattedValue segments={hashrateSuffix(user.hashrate1d)} /></td>
                    <td><FormattedValue segments={hashrateSuffix(user.hashrate7d)} /></td>
                    <td></td>
                    <td><FormattedValue segments={abbreviateNumber(user.bestshare)} /></td>
                    <td><FormattedValue segments={abbreviateNumber(user.bestever)} /></td>
                    <td><FormattedValue segments={abbreviateNumber(user.shares)} /></td>
                    <td><FormattedValue segments={diffToNowDHM(user.lastshare)} /></td>
                </tr>
            </tbody>
        </table>
    );
};