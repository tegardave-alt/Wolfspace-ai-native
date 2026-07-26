# Pearl Harbor Battle - Rencana Implementasi

# Pearl Harbor Battle Scene - Implementation Plan

## File: pearl-harbor.html

- Full Three.js scene with WASD + mouse flight controls
- Loads GLTF plane model from `/uploads/bQQ_PT3OcXXTAoPJjeeEb_1784694764599.gltf`
- Pearl Harbor setting with animated ocean, battleships, smoke
- AI enemy planes
- Explosion effects & AA fire

## Architecture

1. Scene setup (dawn sky, fog, lighting)
2. Ocean (animated plane geometry, reflective)
3. Island/Oahu terrain (simple mesh)
4. Battleships (detailed boxes with turrets)
5. Player plane (GLTF model, WASD controls)
6. Enemy planes (AI patrol + dive bombing)
7. Effects (explosions, smoke, AA tracers)
8. HUD (speed, altitude, health)
