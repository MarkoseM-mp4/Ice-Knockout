const Matter = require('matter-js');

class PhysicsEngine {
    constructor() {
        this.engine = Matter.Engine.create();
        this.engine.gravity.y = 0; // Top-down
        this.world = this.engine.world;

        this.players = new Map(); // socketId -> body
        this.arenaRadius = 300; // Fixed for now, or passed in config
        this.onEliminate = null; // Callback
        this.onCollision = null; // Callback for sparks

        Matter.Events.on(this.engine, 'collisionStart', (event) => {
            if (this.onCollision) {
                const pairs = event.pairs;
                for (let i = 0; i < pairs.length; i++) {
                    const pair = pairs[i];
                    // Check if both are players (have labels starting with socketID usually, but we set label=id)
                    // Actually, simple check: are they in players map?
                    // Or just send collision point for any collision involving a player.

                    // Let's just send the collision point.
                    // Contacts[0].vertex is the point.
                    const collision = {
                        x: pair.collision.supports[0]?.x || pair.bodyA.position.x,
                        y: pair.collision.supports[0]?.y || pair.bodyA.position.y
                    };
                    this.onCollision(collision);
                }
            }
        });
    }

    addPlayer(id) {
        const radius = 15;
        // Spawn logic needs to be here or outside. 
        // For now, spawn at random or fixed.
        // We'll calculate spawn later.
        const x = 0;
        const y = 0;

        const body = Matter.Bodies.circle(x, y, radius, {
            frictionAir: 0.02,
            restitution: 1,
            friction: 0,
            frictionStatic: 0,
            label: id
        });

        Matter.Composite.add(this.world, body);
        this.players.set(id, body);
        return body;
    }

    removePlayer(id) {
        const body = this.players.get(id);
        if (body) {
            Matter.Composite.remove(this.world, body);
            this.players.delete(id);
        }
    }

    applyShootForce(id, angle, power) {
        const body = this.players.get(id);
        if (!body) return;

        // Clamp power
        const MAX_POWER = 150;
        const clampedPower = Math.min(power, MAX_POWER);
        const multiplier = 0.00015;

        const force = {
            x: Math.cos(angle) * clampedPower * multiplier,
            y: Math.sin(angle) * clampedPower * multiplier
        };

        Matter.Body.applyForce(body, body.position, force);
    }

    isSomethingMoving() {
        const VELOCITY_THRESHOLD = 0.05;
        for (const [id, body] of this.players) {
            const speed = Math.sqrt(body.velocity.x ** 2 + body.velocity.y ** 2);
            if (speed > VELOCITY_THRESHOLD) {
                return true;
            }
        }
        return false;
    }

    update() {
        Matter.Engine.update(this.engine, 1000 / 60);

        // Check bounds
        for (const [id, body] of this.players) {
            const dist = Math.sqrt(body.position.x ** 2 + body.position.y ** 2);
            if (dist > this.arenaRadius + 15) { // 15 is radius
                if (this.onEliminate) this.onEliminate(id);
                this.removePlayer(id);
            }
        }
    }

    getState() {
        // Return serializable state for clients
        const state = [];
        for (const [id, body] of this.players) {
            state.push({
                id: id,
                x: body.position.x,
                y: body.position.y,
                vx: body.velocity.x,
                vy: body.velocity.y
            });
        }
        return state;
    }
}

module.exports = PhysicsEngine;
