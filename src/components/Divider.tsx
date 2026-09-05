import './Divider.scss';
import { useState, useEffect } from 'react';
import { Tooltip } from './Tooltip';

interface DividerProps {
    username: string;
    onToggle: () => void;
    isExpanded: boolean;
}

export default function Divider({ username, onToggle, isExpanded }: DividerProps) {
    const LS_KEY = `userVisible_${username.slice(0, 21)}`;

    const [isUserVisible, setIsUserVisible] = useState<boolean>(() => {
        try {
            const stored = localStorage.getItem(LS_KEY);
            return stored !== null ? JSON.parse(stored) : true;
        } catch (error) {
            console.warn('Failed to parse localStorage item:', LS_KEY, error);
            return true;
        }
    });

    useEffect(() => {
        localStorage.setItem(LS_KEY, JSON.stringify(isUserVisible));
    }, [LS_KEY, isUserVisible]);

    const toggleUserVisibility = () => {
        setIsUserVisible(prev => !prev);
    };

    return (
        <div className='divider'>
            <div>
                <span>User</span>
                <Tooltip text={username}>
                    <strong className={isUserVisible ? '' : 'hidden'}>
                        {username}
                    </strong>
                </Tooltip>
            </div>
            <div className='controls'>
                <Tooltip text='User visibility'>
                    <button onClick={toggleUserVisibility}>
                        <i className={`eye ${isUserVisible ? '' : 'hidden'}`}></i>
                    </button>
                </Tooltip>
                <Tooltip text='Table visibility'>
                    <button onClick={onToggle}>
                        <i className={`arrow ${isExpanded ? 'down' : 'up'}`}></i>
                    </button>
                </Tooltip>
            </div>
        </div>
    );
}
