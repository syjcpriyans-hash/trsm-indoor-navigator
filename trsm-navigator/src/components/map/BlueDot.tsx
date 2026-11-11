"use client";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import type { LivePosition } from "@/lib/store";
import { SLAB_TOP, toWorld } from "./sceneUtils";

/** Google-Maps-style position puck: constant on-screen size, heading wedge, uncertainty halo. */
export function BlueDot({ position, estimated }: { position: LivePosition; estimated: boolean }) {
  const g = useRef<THREE.Group>(null);
  const halo = useRef<THREE.Mesh>(null);
  const wedge = useRef<THREE.Mesh>(null);
  const { camera, controls } = useThree() as unknown as { camera: THREE.Camera; controls: { target: THREE.Vector3 } | null };
  const smooth = useRef<THREE.Vector3 | null>(null);
  const smoothHeading = useRef(0);

  const geos = useMemo(() => {
    const wedgeShape = new THREE.Shape();
    wedgeShape.moveTo(0, 0);
    wedgeShape.absarc(0, 0, 11, Math.PI / 2 - 0.55, Math.PI / 2 + 0.55, false);
    wedgeShape.lineTo(0, 0);
    const w = new THREE.ShapeGeometry(wedgeShape, 12);
    w.rotateX(-Math.PI / 2);
    const disc = new THREE.CircleGeometry(2.6, 32).rotateX(-Math.PI / 2);
    const ring = new THREE.CircleGeometry(3.6, 32).rotateX(-Math.PI / 2);
    const haloG = new THREE.CircleGeometry(1, 48).rotateX(-Math.PI / 2);
    return { w, disc, ring, haloG };
  }, []);
  const mats = useMemo(
    () => ({
      // transparent so they render in the same (sorted) pass as the fade-capable floor materials
      disc: new THREE.MeshBasicMaterial({ color: estimated ? "#5B8DEF" : "#1F6FEB", depthTest: false, transparent: true }),
      ring: new THREE.MeshBasicMaterial({ color: "#FFFFFF", depthTest: false, transparent: true }),
      halo: new THREE.MeshBasicMaterial({ color: "#1F6FEB", transparent: true, opacity: 0.14, depthTest: false }),
      wedge: new THREE.MeshBasicMaterial({ color: "#1F6FEB", transparent: true, opacity: 0.28, depthTest: false }),
    }),
    [estimated],
  );

  useFrame((_, dt) => {
    const target = toWorld(position.p, SLAB_TOP + 0.9);
    if (!smooth.current) smooth.current = target.clone();
    smooth.current.lerp(target, 1 - Math.pow(0.0005, dt));
    const grp = g.current;
    if (!grp) return;
    grp.position.copy(smooth.current);
    // constant screen size
    const ref = controls?.target ?? new THREE.Vector3();
    const d = camera.position.distanceTo(ref);
    const s = THREE.MathUtils.clamp(d / 330, 0.45, 3);
    grp.scale.setScalar(s);
    if (halo.current) {
      const r = Math.max(5, position.uncertainty) / s;
      halo.current.scale.setScalar(r);
    }
    if (wedge.current) {
      wedge.current.visible = position.heading != null;
      if (position.heading != null) {
        let diff = position.heading - smoothHeading.current;
        while (diff > 180) diff -= 360;
        while (diff < -180) diff += 360;
        smoothHeading.current += diff * (1 - Math.pow(0.002, dt));
        wedge.current.rotation.y = (-smoothHeading.current * Math.PI) / 180;
      }
    }
  });

  return (
    <group ref={g} renderOrder={40}>
      <mesh ref={halo} geometry={geos.haloG} material={mats.halo} renderOrder={40} />
      <mesh ref={wedge} geometry={geos.w} material={mats.wedge} renderOrder={41} />
      <mesh geometry={geos.ring} material={mats.ring} renderOrder={42} />
      <mesh geometry={geos.disc} material={mats.disc} renderOrder={43} position={[0, 0.01, 0]} />
    </group>
  );
}
