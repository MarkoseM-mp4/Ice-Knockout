class Renderer {
    constructor(canvas, engine) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.engine = engine;
        this.width = canvas.width;
        this.height = canvas.height;
    }

    setSize(width, height) {
        this.width = width;
        this.height = height;
        this.canvas.width = width;
        this.canvas.height = height;
    }

    render(arenaRadius, players, arrows = [], particles = []) {
        this.ctx.clearRect(0, 0, this.width, this.height);
        this.ctx.save();

        // Center the view
        this.ctx.translate(this.width / 2, this.height / 2);

        // Draw Arena
        this.drawArena(arenaRadius);

        // Draw Players (Balls)
        players.forEach(player => {
            this.drawPlayer(player);
        });

        // Draw Arrows
        arrows.forEach(arrow => {
            this.drawArrow(arrow);
        });

        // Draw Particles
        if (particles) {
            particles.forEach(p => {
                this.ctx.globalAlpha = p.life / p.maxLife;
                this.ctx.fillStyle = p.color || '#fff';
                this.ctx.beginPath();
                this.ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
                this.ctx.fill();
            });
            this.ctx.globalAlpha = 1;
        }

        this.ctx.restore();
    }

    drawArena(radius) {
        this.ctx.beginPath();
        if (this.arenaType === 'square') {
            // Draw rectangle
            // radius is half-width
            this.ctx.rect(-radius, -radius, radius * 2, radius * 2);
        } else {
            // Draw circle (default)
            this.ctx.arc(0, 0, radius, 0, Math.PI * 2);
        }
        this.ctx.fillStyle = '#e0f7fa'; // Ice color
        this.ctx.fill();
        this.ctx.lineWidth = 5;
        this.ctx.strokeStyle = '#b2ebf2';
        this.ctx.stroke();
    }

    drawPlayer(player) {
        const pos = player.body.position;
        // Position is relative to screen center in Matter.js if we set it that way,
        // OR we need to adjust coordinate system. 
        // Let's assume Matter world 0,0 is center of arena.

        this.ctx.beginPath();
        this.ctx.arc(pos.x, pos.y, player.radius, 0, Math.PI * 2);
        this.ctx.fillStyle = player.color || '#333';
        this.ctx.fill();
        this.ctx.strokeStyle = '#000';
        this.ctx.lineWidth = 2;
        this.ctx.stroke();

        // Draw label (player name)
        const label = player.name || (player.id ? player.id.substring(0, 4) : '');
        if (label) {
            this.ctx.fillStyle = '#fff';
            this.ctx.font = 'bold 13px Arial';
            this.ctx.textAlign = 'center';
            // Draw text shadow for readability
            this.ctx.shadowColor = 'rgba(0,0,0,0.7)';
            this.ctx.shadowBlur = 3;
            this.ctx.fillText(label, pos.x, pos.y - player.radius - 8);
            this.ctx.shadowBlur = 0;
        }
    }

    drawArrow(arrow) {
        // arrow: { start: {x, y}, end: {x, y} }
        if (!arrow) return;

        this.ctx.beginPath();
        this.ctx.moveTo(arrow.start.x, arrow.start.y);
        this.ctx.lineTo(arrow.end.x, arrow.end.y);
        this.ctx.strokeStyle = 'rgba(255, 0, 0, 0.5)';
        this.ctx.lineWidth = 4;
        this.ctx.stroke();

        // Arrowhead could be added here
    }
}
