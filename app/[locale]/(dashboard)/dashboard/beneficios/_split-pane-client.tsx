"use client";

import { useSelectedLayoutSegment } from "next/navigation";
import SplitPaneLayout from "@/components/dashboard/shared/SplitPaneLayout";
import type { ReactNode } from "react";

interface Props { list: ReactNode; detail: ReactNode; }

export default function SplitPaneClient({ list, detail }: Props) {
  const detailSegment = useSelectedLayoutSegment("detail");
  return <SplitPaneLayout list={list} detail={detail} detailActive={detailSegment !== null} />;
}
