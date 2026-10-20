import type { CSSProperties } from "react";
import logo from "../../public/logo-mark.png";

/** next/image for the preview. The one image the app ships is inlined. */
export default function Image({
  src, alt, width, height, style, className,
}: {
  src: string;
  alt: string;
  width?: number;
  height?: number;
  style?: CSSProperties;
  className?: string;
  priority?: boolean;
}) {
  const resolved = src === "/logo-mark.png" ? (logo as unknown as string) : src;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={resolved} alt={alt} width={width} height={height} style={style} className={className} />;
}
