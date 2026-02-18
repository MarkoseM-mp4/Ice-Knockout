class Game {
    constructor() {
        this.engine = Matter.Engine.create();
        this.engine.gravity.y = 0; // Top-down: no gravity
        this.world = this.engine.world;

        this.arenaRadius = 300; // Will be dynamic
        this.players = []; // Array of custom player objects { id, body, radius, color }
        this.arrows = []; // Visual aim arrows

        // Friction for "Ice" feel
        this.frictionAir = 0.02;

        // Initialize simple bounds (invisible walls for now or just check distance)
        // Actually, we don't want walls, we want them to fall off.
        // So no static bodies for the arena boundary in Physics, only visual.
    }

    init(element) {
        // Setup initial state
        this.updateArenaSize();
    }

    updateArenaSize() {
        this.arenaRadius = Math.min(window.innerWidth, window.innerHeight) * 0.35;
    }

    addPlayer(id, x, y, color = '#ff0000') {
        const radius = 15;
        const body = Matter.Bodies.circle(x, y, radius, {
            frictionAir: this.frictionAir,
            restitution: 1, // Bouncy
            friction: 0,
            frictionStatic: 0,
            label: 'player_' + id // Add label property here
        });
        // We ensure "label" is set properly on the body options
        // Matter.js Body.create options, or body.label directly.
        // Matter.Bodies.circle options argument handles this.

        Matter.Composite.add(this.world, body);
        this.players.push({ id, body, radius, color });
        return body;
    }

    update() {
        Matter.Engine.update(this.engine, 1000 / 60);

        // Update particles
        if (this.particles) {
            for (let i = this.particles.length - 1; i >= 0; i--) {
                const p = this.particles[i];
                p.life--;
                p.x += p.vx;
                p.y += p.vy;
                p.alpha = p.life / p.maxLife;
                if (p.life <= 0) {
                    this.particles.splice(i, 1);
                }
            }
        }

        // Check for falling off (Boundary Detection)
        this.players.forEach((p, index) => {
            const dist = Math.sqrt(p.body.position.x ** 2 + p.body.position.y ** 2);
            if (dist > this.arenaRadius + p.radius) {
                // Eliminate
                console.log(`Player ${p.id} eliminated`);
                this.removePlayer(index);
            }

            // Generate ice chips if moving fast enough
            const speed = Math.sqrt(p.body.velocity.x ** 2 + p.body.velocity.y ** 2);
            if (speed > 0.5) {
                this.createIceChips(p.body.position.x, p.body.position.y);
            }
        });
    }

    createIceChips(x, y) {
        if (!this.particles) this.particles = [];
        // Create 1-2 chips
        for (let i = 0; i < 1; i++) {
            if (Math.random() > 0.3) continue;
            this.particles.push({
                x: x + (Math.random() - 0.5) * 10,
                y: y + (Math.random() - 0.5) * 10,
                vx: (Math.random() - 0.5) * 0.5,
                vy: (Math.random() - 0.5) * 0.5,
                life: 20 + Math.random() * 10,
                maxLife: 30,
                alpha: 1,
                color: `rgba(220, 240, 255, ${0.5 + Math.random() * 0.5})`,
                size: Math.random() * 2 + 1,
                type: 'chip'
            });
        }
    }

    createSparks(x, y) {
        if (!this.particles) this.particles = [];
        for (let i = 0; i < 10; i++) {
            this.particles.push({
                x: x,
                y: y,
                vx: (Math.random() - 0.5) * 5,
                vy: (Math.random() - 0.5) * 5,
                life: 15 + Math.random() * 10,
                maxLife: 25,
                color: `rgba(255, ${Math.floor(200 + Math.random() * 55)}, 0, 1)`,
                size: Math.random() * 3 + 1,
                type: 'spark'
            });
        }
    }

    removePlayer(index) {
        const p = this.players[index];
        Matter.Composite.remove(this.world, p.body);
        this.players.splice(index, 1);
    }
}
