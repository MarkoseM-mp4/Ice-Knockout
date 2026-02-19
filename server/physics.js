const Matter = require('matter-js');

class PhysicsEngine {
    constructor(arenaType = "round") {
        this.engine = Matter.Engine.create();
        this.engine.gravity.y = 0; // Top-down
        this.world = this.engine.world;

        this.players = new Map(); // socketId -> body
        this.arenaRadius = 300; // Fixed for now, or passed in config
        this.arenaType = arenaType;
        this.onEliminate = null; // Callback
        this.onCollision = null; // Callback for sparks

        Matter.Events.on(this.engine, 'collisionStart', (event) => {
            const pairs = event.pairs;
            for (let i = 0; i < pairs.length; i++) {
                const pair = pairs[i];
                const bodyA = pair.bodyA;
                const bodyB = pair.bodyB;

                // Track last touch
                if (this.players.has(bodyA.label) && this.players.has(bodyB.label)) {
                    bodyA.lastTouchedBy = bodyB.label;
                    bodyB.lastTouchedBy = bodyA.label;
                }

                if (this.onCollision) {
                    const collision = {
                        x: pair.collision.supports[0]?.x || pair.bodyA.position.x,
                        y: pair.collision.supports[0]?.y || pair.bodyA.position.y
                    };
                    this.onCollision(collision);
                }
            }
        });
    }

    // ... (rest of methods)

    update() {
        Matter.Engine.update(this.engine, 1000 / 60);

        // Check bounds
        for (const [id, body] of this.players) {
            let isOut = false;
            let isNearEdge = false;
            const speed = Math.sqrt(body.velocity.x ** 2 + body.velocity.y ** 2);

            if (this.arenaType === 'square') {
                // Square logic (axis-aligned box)
                // Center is 0,0. Width/Height = arenaRadius * 2
                // Wait, if it's square, arenaRadius is actually half-width
                const halfSize = this.arenaRadius;

                if (Math.abs(body.position.x) > halfSize || Math.abs(body.position.y) > halfSize) {
                    isOut = true;
                }

                // Near edge check
                if (Math.abs(body.position.x) > halfSize - 20 || Math.abs(body.position.y) > halfSize - 20) {
                    isNearEdge = true;
                }

                // Braking logic inside square
                if (speed < 0.2 && speed > 0 && !isOut && !isNearEdge) {
                    Matter.Body.setVelocity(body, { x: 0, y: 0 });
                }

                // Slope logic for square (push away from center logic or simple push?)
                // Simple push: if x > 0 push right, x < 0 push left.
                if (isNearEdge) {
                    const forceMagnitude = 0.0003;
                    let fx = 0;
                    let fy = 0;

                    if (body.position.x > halfSize - 20) fx = forceMagnitude;
                    if (body.position.x < -(halfSize - 20)) fx = -forceMagnitude;
                    if (body.position.y > halfSize - 20) fy = forceMagnitude;
                    if (body.position.y < -(halfSize - 20)) fy = -forceMagnitude;

                    Matter.Body.applyForce(body, body.position, { x: fx, y: fy });
                }

            } else {
                // Round Logic
                const dist = Math.sqrt(body.position.x ** 2 + body.position.y ** 2);

                if (dist > this.arenaRadius) {
                    isOut = true;
                }

                if (dist > this.arenaRadius - 20) {
                    isNearEdge = true;
                }

                // "Sudden Stop" Braking Logic
                if (speed < 0.2 && speed > 0 && dist < this.arenaRadius - 5) { // -5 safe margin
                    Matter.Body.setVelocity(body, { x: 0, y: 0 });
                }

                // "Slope" logic
                if (isNearEdge) {
                    const forceMagnitude = 0.0003; // Tiny nudge
                    const angle = Math.atan2(body.position.y, body.position.x);
                    Matter.Body.applyForce(body, body.position, {
                        x: Math.cos(angle) * forceMagnitude,
                        y: Math.sin(angle) * forceMagnitude
                    });
                }
            }

            // Eliminate
            if (isOut) {
                if (this.onEliminate) {
                    try {
                        this.onEliminate(id, body.lastTouchedBy);
                    } catch (err) {
                        console.error("Error in onEliminate callback:", err);
                    }
                }
                this.removePlayer(id);
            }
        }
    }

    addPlayer(id) {
        const radius = 15;
        // Spawn logic needs to be here or outside. 
        // For now, spawn at random or fixed.
        // We'll calculate spawn later.
        const x = 0;
        const y = 0;

        const body = Matter.Bodies.circle(x, y, radius, {
            frictionAir: 0.02,  // Reverted to balanced value
            restitution: 0.8,   // Bouncy again
            friction: 0.002,    // Low surface friction
            frictionStatic: 0,
            label: id
        });

        body.lastTouchedBy = null; // Track who last touched this player

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
        const VELOCITY_THRESHOLD = 0.03; // Increased to end turns faster
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
            const speed = Math.sqrt(body.velocity.x ** 2 + body.velocity.y ** 2);

            // "Sudden Stop" Braking Logic
            // If moving slowly but safe inside arena (not falling off edge), stop immediately
            // This prevents the long slow slide at the end of a turn
            if (speed < 0.2 && speed > 0 && dist < this.arenaRadius - 5) {
                Matter.Body.setVelocity(body, { x: 0, y: 0 });
            }

            // "Slope" logic: if near edge, push outward slightly
            // This prevents "sticking" to the exact edge
            if (dist > this.arenaRadius - 20) {
                const forceMagnitude = 0.0003; // Tiny nudge
                const angle = Math.atan2(body.position.y, body.position.x);
                Matter.Body.applyForce(body, body.position, {
                    x: Math.cos(angle) * forceMagnitude,
                    y: Math.sin(angle) * forceMagnitude
                });
            }

            // Eliminate if center crosses the boundary (more intuitive)
            if (dist > this.arenaRadius) {
                if (this.onEliminate) {
                    try {
                        this.onEliminate(id, body.lastTouchedBy);
                    } catch (err) {
                        console.error("Error in onEliminate callback:", err);
                    }
                }
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
