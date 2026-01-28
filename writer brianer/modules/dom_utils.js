// modules/dom_utils.js

(function() {
    'use strict';

    window.WBAP = window.WBAP || {};

    /**
     * Makes a UI element draggable.
     * @param {HTMLElement} element The element to make draggable.
     * @param {function} [onClick] A callback to execute if the interaction was a click (not a drag).
     * @param {function} [onDragEnd] A callback to execute when a drag operation finishes.
     */
    function makeDraggable(element, onClick, onDragEnd) {
        const MOVE_THRESHOLD = 10; // allow small finger drift to count as a tap
        let isDragging = false;
        let hasMoved = false;
        let startX, startY, initialLeft, initialTop;

        const onPointerDown = (e) => {
            isDragging = true;
            hasMoved = false;
            element.style.transition = 'none';
            
            const touch = e.touches ? e.touches[0] : e;
            startX = touch.clientX;
            startY = touch.clientY;
            
            const rect = element.getBoundingClientRect();
            initialLeft = rect.left;
            initialTop = rect.top;

            document.addEventListener('mousemove', onPointerMove);
            document.addEventListener('mouseup', onPointerUp);
            document.addEventListener('touchmove', onPointerMove, { passive: false });
            document.addEventListener('touchend', onPointerUp);

            // Prevent default behavior for touch to avoid scrolling the page
            if (e.type === 'touchstart') {
                e.preventDefault();
            }
        };

        const onPointerMove = (e) => {
            if (!isDragging) return;

            const touch = e.touches ? e.touches[0] : e;
            const deltaX = touch.clientX - startX;
            const deltaY = touch.clientY - startY;

            // Register as a "move" only after a certain threshold to distinguish from a click
            if (!hasMoved && (Math.abs(deltaX) > MOVE_THRESHOLD || Math.abs(deltaY) > MOVE_THRESHOLD)) {
                hasMoved = true;
            }

            if (hasMoved) {
                let newLeft = initialLeft + deltaX;
                let newTop = initialTop + deltaY;

                // Clamp the position within the viewport
                const margin = 20;
                newLeft = Math.max(margin, Math.min(newLeft, window.innerWidth - element.offsetWidth - margin));
                newTop = Math.max(margin, Math.min(newTop, window.innerHeight - element.offsetHeight - margin));
                
                element.style.right = 'auto';
                element.style.bottom = 'auto';
                element.style.left = `${newLeft}px`;
                element.style.top = `${newTop}px`;

                if (e.type === 'touchmove') {
                    e.preventDefault();
                }
            }
        };

        const onPointerUp = () => {
            if (!isDragging) return;
            isDragging = false;
            
            element.style.transition = 'all 0.3s ease';

            document.removeEventListener('mousemove', onPointerMove);
            document.removeEventListener('mouseup', onPointerUp);
            document.removeEventListener('touchmove', onPointerMove);
            document.removeEventListener('touchend', onPointerUp);

            if (hasMoved) {
                // If it was a drag, execute the onDragEnd callback
                if (onDragEnd) {
                    const rect = element.getBoundingClientRect();
                    onDragEnd({ top: `${rect.top}px`, left: `${rect.left}px` });
                }
            } else {
                // If it was just a click, execute the onClick callback
                if (onClick) {
                    onClick();
                }
            }
        };

        element.addEventListener('mousedown', onPointerDown);
        element.addEventListener('touchstart', onPointerDown, { passive: false });
    }

    // Expose the utility to the global namespace
    window.WBAP.makeDraggable = makeDraggable;

})();
