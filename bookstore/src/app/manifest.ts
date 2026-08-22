import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Melio Bookstore Staff",
    short_name: "Melio Staff",
    description: "Quét mã, kiểm kho và xử lý tác vụ cửa hàng",
    start_url: "/inventory",
    display: "standalone",
    background_color: "#f1f5f9",
    theme_color: "#2563eb",
    icons: [{ src: "/favicon.ico", sizes: "any", type: "image/x-icon" }],
  };
}
