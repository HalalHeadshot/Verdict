import { useEffect, useRef } from 'react';
import { gsap } from 'gsap';

export default function DotGrid({
    dotSize = 10,
    gap = 15,
    baseColor = '#5227FF',
    activeColor = '#5227FF',
    proximity = 120,
    shockRadius = 250,
    shockStrength = 5,
    resistance = 750,
    returnDuration = 1.5,
}) {
    const canvasRef = useRef(null);
    const dotsRef = useRef([]);
    const mouseRef = useRef({ x: 0, y: 0 });
    const animationFrameRef = useRef(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        const dpr = window.devicePixelRatio || 1;

        // Set canvas size
        const resizeCanvas = () => {
            const rect = canvas.getBoundingClientRect();
            canvas.width = rect.width * dpr;
            canvas.height = rect.height * dpr;
            ctx.scale(dpr, dpr);
            canvas.style.width = `${rect.width}px`;
            canvas.style.height = `${rect.height}px`;
            initDots();
        };

        // Initialize dots
        const initDots = () => {
            dotsRef.current = [];
            const rect = canvas.getBoundingClientRect();
            const cols = Math.floor(rect.width / gap);
            const rows = Math.floor(rect.height / gap);

            for (let i = 0; i < cols; i++) {
                for (let j = 0; j < rows; j++) {
                    const x = i * gap + gap / 2;
                    const y = j * gap + gap / 2;
                    dotsRef.current.push({
                        x,
                        y,
                        originalX: x,
                        originalY: y,
                        vx: 0,
                        vy: 0,
                    });
                }
            }
        };

        // Handle mouse move
        const handleMouseMove = (e) => {
            const rect = canvas.getBoundingClientRect();
            mouseRef.current = {
                x: e.clientX - rect.left,
                y: e.clientY - rect.top,
            };
        };

        // Handle mouse click for shock wave
        const handleClick = (e) => {
            const rect = canvas.getBoundingClientRect();
            const clickX = e.clientX - rect.left;
            const clickY = e.clientY - rect.top;

            dotsRef.current.forEach((dot) => {
                const dx = dot.x - clickX;
                const dy = dot.y - clickY;
                const distance = Math.sqrt(dx * dx + dy * dy);

                if (distance < shockRadius) {
                    const angle = Math.atan2(dy, dx);
                    const force = (1 - distance / shockRadius) * shockStrength;
                    dot.vx += Math.cos(angle) * force;
                    dot.vy += Math.sin(angle) * force;
                }
            });
        };

        // Animation loop
        const animate = () => {
            const rect = canvas.getBoundingClientRect();
            ctx.clearRect(0, 0, rect.width, rect.height);

            dotsRef.current.forEach((dot) => {
                // Calculate distance to mouse
                const dx = mouseRef.current.x - dot.x;
                const dy = mouseRef.current.y - dot.y;
                const distance = Math.sqrt(dx * dx + dy * dy);

                // Apply proximity effect
                if (distance < proximity) {
                    const angle = Math.atan2(dy, dx);
                    const force = (1 - distance / proximity) * 0.5;
                    dot.vx -= Math.cos(angle) * force;
                    dot.vy -= Math.sin(angle) * force;
                }

                // Apply spring force back to original position
                const springX = (dot.originalX - dot.x) / resistance;
                const springY = (dot.originalY - dot.y) / resistance;
                dot.vx += springX;
                dot.vy += springY;

                // Apply damping
                dot.vx *= 0.95;
                dot.vy *= 0.95;

                // Update position
                dot.x += dot.vx;
                dot.y += dot.vy;

                // Calculate opacity based on distance from original position
                const displacement = Math.sqrt(
                    Math.pow(dot.x - dot.originalX, 2) + Math.pow(dot.y - dot.originalY, 2)
                );
                const opacity = Math.min(1, displacement / 20);

                // Draw dot
                ctx.beginPath();
                ctx.arc(dot.x, dot.y, dotSize / 2, 0, Math.PI * 2);

                if (opacity > 0.1) {
                    ctx.fillStyle = activeColor;
                    ctx.globalAlpha = opacity;
                } else {
                    ctx.fillStyle = baseColor;
                    ctx.globalAlpha = 0.3;
                }

                ctx.fill();
                ctx.globalAlpha = 1;
            });

            animationFrameRef.current = requestAnimationFrame(animate);
        };

        // Initialize
        resizeCanvas();
        window.addEventListener('resize', resizeCanvas);
        canvas.addEventListener('mousemove', handleMouseMove);
        canvas.addEventListener('click', handleClick);
        animate();

        // Cleanup
        return () => {
            window.removeEventListener('resize', resizeCanvas);
            canvas.removeEventListener('mousemove', handleMouseMove);
            canvas.removeEventListener('click', handleClick);
            if (animationFrameRef.current) {
                cancelAnimationFrame(animationFrameRef.current);
            }
        };
    }, [dotSize, gap, baseColor, activeColor, proximity, shockRadius, shockStrength, resistance, returnDuration]);

    return (
        <canvas
            ref={canvasRef}
            style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                pointerEvents: 'auto',
            }}
        />
    );
}
