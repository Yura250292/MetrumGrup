"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { ChevronDown, type LucideIcon } from "lucide-react";
import Image from "next/image";

interface Service {
  icon: LucideIcon;
  title: string;
  desc: string;
  features: string[];
  image: string;
}

interface ServiceAccordionProps {
  services: Service[];
}

export function ServiceAccordion({ services }: ServiceAccordionProps) {
  const [active, setActive] = useState(0);

  return (
    <div className="grid gap-8 lg:grid-cols-2 items-start">
      <div className="space-y-2">
        {services.map((service, i) => {
          const isActive = i === active;
          const Icon = service.icon;

          return (
            <div
              key={service.title}
              className={cn(
                "border transition-all duration-300 cursor-pointer overflow-hidden",
                isActive
                  ? "border-primary/30 bg-primary/5 shadow-lg shadow-primary/5"
                  : "border-[#2d2d2d] bg-[#1A1A1A] hover:border-[#3d3d3d]"
              )}
              onClick={() => setActive(i)}
            >
              <div className="flex items-center gap-4 p-5">
                <div
                  className={cn(
                    "flex h-11 w-11 items-center justify-center transition-colors flex-shrink-0",
                    isActive ? "bg-primary text-white" : "bg-[#2d2d2d] text-[#999]"
                  )}
                >
                  <Icon className="h-5 w-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className={cn("font-semibold text-[#F5F5F0]", isActive && "text-primary")}>
                    {service.title}
                  </h3>
                  {!isActive && (
                    <p className="text-xs text-[#999] mt-0.5 truncate">
                      {service.desc}
                    </p>
                  )}
                </div>
                <ChevronDown
                  className={cn(
                    "h-5 w-5 text-[#999] transition-transform duration-300 flex-shrink-0",
                    isActive && "rotate-180 text-primary"
                  )}
                />
              </div>

              <div
                className={cn(
                  "grid transition-all duration-300",
                  isActive ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
                )}
              >
                <div className="overflow-hidden">
                  <div className="px-5 pb-5">
                    <p className="text-sm text-[#999] leading-relaxed mb-4">
                      {service.desc}
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      {service.features.map((f) => (
                        <div key={f} className="flex items-center gap-2 text-xs">
                          <div className="h-1 w-1 bg-primary flex-shrink-0" />
                          <span className="text-[#ccc]">{f}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="hidden lg:block sticky top-24">
        <div className="relative aspect-[4/5] overflow-hidden">
          {services.map((service, i) => (
            <div
              key={i}
              className={cn(
                "absolute inset-0 transition-all duration-500",
                i === active ? "opacity-100 scale-100" : "opacity-0 scale-105"
              )}
            >
              <Image
                src={service.image}
                alt={service.title}
                fill
                className="object-cover"
                sizes="(max-width: 1024px) 0px, 50vw"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
              <div className="absolute bottom-6 left-6 right-6">
                <span className="inline-flex items-center gap-2 bg-white/10 backdrop-blur-md border border-white/20 px-4 py-2 text-sm font-medium text-white">
                  <service.icon className="h-4 w-4" />
                  {service.title}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
