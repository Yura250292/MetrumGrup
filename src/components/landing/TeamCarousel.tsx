"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { ChevronLeft, ChevronRight } from "lucide-react";
import Image from "next/image";

interface TeamMember {
  name: string;
  role: string;
  photo: string;
  description: string;
}

interface TeamCarouselProps {
  members: TeamMember[];
}

export function TeamCarousel({ members }: TeamCarouselProps) {
  const [active, setActive] = useState(0);
  const visibleCount = 3;

  function next() {
    setActive((prev) => Math.min(prev + 1, members.length - visibleCount));
  }

  function prev() {
    setActive((prev) => Math.max(prev - 1, 0));
  }

  return (
    <div>
      <div className="flex items-center justify-end gap-2 mb-6">
        <button
          onClick={prev}
          disabled={active === 0}
          className="flex h-10 w-10 items-center justify-center border border-[#2d2d2d] bg-[#1A1A1A] text-[#F5F5F0] hover:bg-[#2d2d2d] disabled:opacity-30 transition-all duration-300"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <button
          onClick={next}
          disabled={active >= members.length - visibleCount}
          className="flex h-10 w-10 items-center justify-center border border-[#2d2d2d] bg-[#1A1A1A] text-[#F5F5F0] hover:bg-[#2d2d2d] disabled:opacity-30 transition-all duration-300"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      <div className="overflow-hidden">
        <div
          className="flex gap-5 transition-transform duration-500 ease-out"
          style={{ transform: `translateX(-${active * (100 / visibleCount + 1.5)}%)` }}
        >
          {members.map((member) => (
            <div
              key={member.name}
              className="flex-shrink-0 w-full sm:w-[calc(50%-10px)] lg:w-[calc(33.333%-14px)]"
            >
              <div className="group border border-[#2d2d2d] bg-[#1A1A1A] overflow-hidden transition-all duration-300 hover:border-primary/30 hover:-translate-y-1 hover:shadow-xl hover:shadow-primary/5">
                <div className="relative aspect-[3/4] overflow-hidden bg-[#2d2d2d]">
                  <Image
                    src={member.photo}
                    alt={member.name}
                    fill
                    className="object-cover object-top transition-transform duration-500 group-hover:scale-105"
                    sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                </div>

                <div className="p-5">
                  <h3 className="font-semibold text-[#F5F5F0]">{member.name}</h3>
                  <p className="text-xs text-primary font-medium mt-0.5 font-mono">
                    {member.role}
                  </p>
                  <p className="mt-3 text-xs text-[#999] leading-relaxed line-clamp-3">
                    {member.description}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
