export default function Spinner({ size = 6 }: { size?: number }) {
  return (
    <div
      className={`w-${size} h-${size} border-2 border-gray-700 border-t-dram-accent rounded-full animate-spin`}
    />
  );
}
