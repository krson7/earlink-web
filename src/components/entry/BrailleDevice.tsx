import Image from "next/image";

export default function BrailleDevice() {
  return (
    <div className="device-scene" aria-hidden="true">
      <div className="device-light" />
      <Image
        className="device-product"
        src="/earlink-device.svg"
        alt=""
        width={760}
        height={440}
        draggable={false}
      />
    </div>
  );
}
