import type { Metadata } from "next";
import { Manrope, Lora } from "next/font/google";
import { Toaster } from "@/components/ui/toast";
import "./globals.css";

// Гротеск для UI — Чертёж.md, БЛОК 4.
const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin", "cyrillic"],
  display: "swap",
});

// Сериф для портретов типа — «читается как о тебе», не парадно.
const lora = Lora({
  variable: "--font-lora",
  subsets: ["latin", "cyrillic"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Эннеаграмма.one — тест на тип личности",
  description:
    "Пройди адаптивный тест Эннеаграммы и узнай свой тип за несколько минут — без гороскопной воды.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="ru"
      className={`${manrope.variable} ${lora.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col bg-background text-foreground">
        {children}
        <Toaster />
      </body>
    </html>
  );
}
