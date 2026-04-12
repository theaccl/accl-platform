"use client";

import { useRouter } from "next/navigation";

type Props = {
  label: string;
  route: string;
};

export default function HomeButton({ label, route }: Props) {
  const router = useRouter();

  return (
    <button
      onClick={() => router.push(route)}
      className="w-64 py-4 bg-[#161b22] text-white rounded-xl text-lg font-semibold hover:bg-[#21262d] transition"
    >
      {label}
    </button>
  );
}
