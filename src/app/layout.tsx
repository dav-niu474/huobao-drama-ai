import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "AI短剧创作平台",
  description: "AI驱动的短剧创作平台 - 从剧本到成片，一站式短剧制作工作台",
  keywords: ["AI", "短剧", "创作", "剧本", "分镜", "视频制作"],
  icons: {
    icon: "https://z-cdn.chatglm.cn/z-ai/static/logo.svg",
  },
};

// Root layout is a pass-through — the [locale] layout renders the <html> shell
// so it can set lang={locale} dynamically.
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return children;
}
