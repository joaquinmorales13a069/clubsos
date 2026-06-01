import { ReactNode } from "react";

interface SplitPaneLayoutProps {
  list: ReactNode;
  detail: ReactNode;
  detailActive?: boolean;
}

export default function SplitPaneLayout({
  list,
  detail,
  detailActive = false,
}: SplitPaneLayoutProps) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 items-start">
      <div className={`${detailActive ? "hidden md:block" : "block"} lg:col-span-3`}>
        {list}
      </div>
      <aside
        className={`${detailActive ? "block" : "hidden md:block"} lg:col-span-1 lg:sticky lg:top-20`}
      >
        {detail}
      </aside>
    </div>
  );
}
