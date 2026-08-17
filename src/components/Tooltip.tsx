import './Tooltip.scss';
import React, { useState, useRef, ReactElement, ReactNode } from 'react';
import { createPortal } from 'react-dom';

interface TooltipProps {
    children: ReactElement<{
        onMouseEnter?: React.MouseEventHandler;
        onMouseLeave?: React.MouseEventHandler;
        ref?: React.Ref<HTMLElement>;
        [key: string]: any;
    }>;
    text: ReactNode;
}

function useCombinedRefs<T>(...refs: React.Ref<T>[]): React.RefCallback<T> {
    return (element) => {
        refs.forEach(ref => {
            if (!ref) return;
            if (typeof ref === 'function') {
                ref(element);
            } else if (typeof ref === 'object') {
                (ref as React.RefObject<T | null>).current = element;
            }
        });
    };
}

export function Tooltip({ children, text }: TooltipProps) {
    const [visible, setVisible] = useState(false);
    const [coords, setCoords] = useState({ top: 0, left: 0 });
    const targetRef = useRef<HTMLElement | null>(null);

    const handleMouseEnter = () => {
        if (targetRef.current) {
            const rect = targetRef.current.getBoundingClientRect();
            setCoords({
                top: rect.top + window.scrollY - 32,
                left: rect.left + window.scrollX + rect.width / 2,
            });
            setVisible(true);
        }
    };

    const handleMouseLeave = () => {
        setVisible(false);
    };

    const child = React.Children.only(children) as ReactElement<{
        onMouseEnter?: React.MouseEventHandler;
        onMouseLeave?: React.MouseEventHandler;
        ref?: React.Ref<HTMLElement>;
        [key: string]: any;
    }>;

    const { ref: childRef, onMouseEnter, onMouseLeave } = child.props;

    const combinedRef = childRef ? useCombinedRefs(targetRef, childRef) : targetRef;

    const clonedChild = React.cloneElement(child, {
        ref: combinedRef,
        onMouseEnter: (e: React.MouseEvent) => {
            if (onMouseEnter) onMouseEnter(e);
            handleMouseEnter();
        },
        onMouseLeave: (e: React.MouseEvent) => {
            if (onMouseLeave) onMouseLeave(e);
            handleMouseLeave();
        },
    });

    return (
        <>
            {clonedChild}
            {visible &&
                createPortal(
                    <span
                        className="tooltip"
                        style={{
                            top: coords.top,
                            left: coords.left,
                        }}
                    >
                        {text}
                    </span>,
                    document.body
                )}
        </>
    );
}
