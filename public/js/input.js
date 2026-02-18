class InputHandler {
    constructor(canvas, socket, game) {
        this.canvas = canvas;
        this.socket = socket;
        this.game = game;

        this.isDragging = false;
        this.startPos = { x: 0, y: 0 };
        this.currentPos = { x: 0, y: 0 };
        this.selectedBody = null;

        this.MAX_POWER = 150;
        this.MULTIPLIER = 0.002; // Force multiplier

        this.setupListeners();
    }

    setupListeners() {
        this.canvas.addEventListener('mousedown', (e) => this.onMouseDown(e));
        window.addEventListener('mousemove', (e) => this.onMouseMove(e));
        window.addEventListener('mouseup', (e) => this.onMouseUp(e));
    }

    getMousePos(e) {
        const rect = this.canvas.getBoundingClientRect();
        // Translate to center-based coordinates to match rendering/physics
        return {
            x: e.clientX - rect.left - this.canvas.width / 2,
            y: e.clientY - rect.top - this.canvas.height / 2
        };
    }

    onMouseDown(e) {
        const pos = this.getMousePos(e);

        // Check if clicked on a player ball (owned by this client)
        // For prototype, just check any ball
        const clickedPlayer = this.game.players.find(p => {
            const dx = p.body.position.x - pos.x;
            const dy = p.body.position.y - pos.y;
            return Math.sqrt(dx * dx + dy * dy) < p.radius;
        });

        if (clickedPlayer) {
            this.isDragging = true;
            this.selectedBody = clickedPlayer.body;
            this.startPos = pos;
            this.currentPos = pos;
        }
    }

    onMouseMove(e) {
        if (!this.isDragging) return;
        this.currentPos = this.getMousePos(e);

        // Update visual arrow in game
        // Arrow points OPPOSITE to drag
        let dx = this.startPos.x - this.currentPos.x;
        let dy = this.startPos.y - this.currentPos.y;

        // Clamp length
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > this.MAX_POWER) {
            const angle = Math.atan2(dy, dx);
            dx = Math.cos(angle) * this.MAX_POWER;
            dy = Math.sin(angle) * this.MAX_POWER;
        }

        // We pass the arrow data to the game/renderer
        this.game.arrows = [{
            start: this.selectedBody.position,
            end: {
                x: this.selectedBody.position.x + dx,
                y: this.selectedBody.position.y + dy
            }
        }];
    }

    onMouseUp(e) {
        if (!this.isDragging) return;

        const pos = this.getMousePos(e);
        const dx = this.startPos.x - pos.x; // Drag back to shoot forward? Or drag forward to shoot?
        // "aims and shoots their ball (like pool)" -> usually pull back
        // "Arrow in opposite direction of mouse" -> Pull back cue, arrow shows shot direction.
        // So if I drag mouse LEFT, ball should go RIGHT.
        // dx = ball.x - mouse.x is correct for direction.

        const dy = this.startPos.y - pos.y;

        const dist = Math.sqrt(dx * dx + dy * dy);
        const power = Math.min(dist, this.MAX_POWER);
        const angle = Math.atan2(dy, dx);

        const force = {
            x: Math.cos(angle) * power * this.MULTIPLIER,
            y: Math.sin(angle) * power * this.MULTIPLIER
        };

        Matter.Body.applyForce(this.selectedBody, this.selectedBody.position, force);

        this.isDragging = false;
        this.selectedBody = null;
        this.game.arrows = [];
    }
}
