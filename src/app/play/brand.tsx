import Image from "next/image";

export function ForkMark({ size = 42 }: { size?: number }) {
  return <Image className="fork-mark" src="/brand/icon.png" width={size} height={size} alt="" />;
}
