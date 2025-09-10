"use client";

import { useParams } from "next/navigation";
import PublicPrototypePage from "./PublicPrototypePage";

export default function PrototypePage() {
  const params = useParams<{ prototype_id: string; }>();
  const prototypeId = params?.prototype_id;

  if (!prototypeId) {
    return null;
  }

  return <PublicPrototypePage prototypeId={prototypeId} />;
}
