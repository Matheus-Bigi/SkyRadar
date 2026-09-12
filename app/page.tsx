import dynamic from "next/dynamic";

const SkyRadarApp = dynamic(() => import("../src/components/SkyRadarApp"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center bg-radar-bg">
      <span className="font-mono text-sm tracking-[0.3em] text-radar-textdim">SKYRADAR</span>
    </div>
  ),
});

export default function Page() {
  return <SkyRadarApp />;
}
