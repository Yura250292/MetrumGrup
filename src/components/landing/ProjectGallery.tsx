"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import Image from "next/image";
import { ArrowUpRight, X, ChevronLeft, ChevronRight } from "lucide-react";

interface Project {
  title: string;
  category: string;
  area: string;
  location: string;
  price?: string;
  image: string;
  images?: string[];
  description?: string;
}

interface ProjectGalleryProps {
  projects: Project[];
  categories: string[];
}

export function ProjectGallery({ projects, categories }: ProjectGalleryProps) {
  const [filter, setFilter] = useState("Всі");
  const [lightbox, setLightbox] = useState<{ project: Project; imageIndex: number } | null>(null);

  const filtered =
    filter === "Всі"
      ? projects
      : projects.filter((p) => p.category === filter);

  function openLightbox(project: Project, index = 0) {
    setLightbox({ project, imageIndex: index });
    document.body.style.overflow = "hidden";
  }

  function closeLightbox() {
    setLightbox(null);
    document.body.style.overflow = "";
  }

  function nextImage() {
    if (!lightbox) return;
    const images = lightbox.project.images || [lightbox.project.image];
    setLightbox({
      ...lightbox,
      imageIndex: (lightbox.imageIndex + 1) % images.length,
    });
  }

  function prevImage() {
    if (!lightbox) return;
    const images = lightbox.project.images || [lightbox.project.image];
    setLightbox({
      ...lightbox,
      imageIndex: (lightbox.imageIndex - 1 + images.length) % images.length,
    });
  }

  return (
    <>
      <div className="flex flex-wrap gap-2 mb-8">
        {["Всі", ...categories].map((cat) => (
          <button
            key={cat}
            onClick={() => setFilter(cat)}
            className={cn(
              "px-5 py-2 text-sm font-medium transition-all duration-300",
              filter === cat
                ? "bg-primary text-white shadow-lg shadow-primary/20"
                : "bg-[#1A1A1A] border border-[#2d2d2d] text-[#999] hover:border-primary/30 hover:text-[#F5F5F0]"
            )}
          >
            {cat}
          </button>
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((project) => (
          <div
            key={project.title}
            className="group relative overflow-hidden cursor-pointer bg-[#1A1A1A]"
            onClick={() => openLightbox(project)}
          >
            <div className="relative aspect-[4/3]">
              <Image
                src={project.image}
                alt={project.title}
                fill
                className="object-cover transition-transform duration-700 group-hover:scale-110"
                sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-80 group-hover:opacity-90 transition-opacity" />

              <div className="absolute inset-0 flex flex-col justify-end p-5">
                <div className="flex items-end justify-between">
                  <div>
                    <span className="inline-block bg-white/10 backdrop-blur-md px-3 py-1 text-[10px] font-semibold text-white/80 uppercase tracking-wide mb-2 font-mono">
                      {project.category}
                    </span>
                    <h3 className="text-lg font-bold text-white font-heading">
                      {project.title}
                    </h3>
                    <div className="flex items-center gap-3 mt-1 text-xs text-white/50 font-mono">
                      <span>{project.area}</span>
                      <span className="h-1 w-1 bg-white/30" />
                      <span>{project.location}</span>
                      {project.price && (
                        <>
                          <span className="h-1 w-1 bg-white/30" />
                          <span>{project.price}</span>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="flex h-10 w-10 items-center justify-center bg-white/10 backdrop-blur-md border border-white/20 text-white opacity-0 group-hover:opacity-100 transition-all duration-300 translate-y-2 group-hover:translate-y-0">
                    <ArrowUpRight className="h-4 w-4" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {lightbox && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-sm"
          onClick={closeLightbox}
        >
          <button
            onClick={closeLightbox}
            className="absolute top-6 right-6 flex h-10 w-10 items-center justify-center bg-white/10 text-white hover:bg-white/20 transition-colors z-10"
          >
            <X className="h-5 w-5" />
          </button>

          <div
            className="relative w-full max-w-5xl mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="relative aspect-[16/10] overflow-hidden">
              <Image
                src={
                  (lightbox.project.images || [lightbox.project.image])[
                    lightbox.imageIndex
                  ]
                }
                alt={lightbox.project.title}
                fill
                className="object-cover"
                sizes="100vw"
              />
            </div>

            <div className="mt-4 text-center">
              <h3 className="text-xl font-bold text-white font-heading">
                {lightbox.project.title}
              </h3>
              <p className="mt-1 text-sm text-white/50 font-mono">
                {lightbox.project.area} • {lightbox.project.location}
                {lightbox.project.description && ` • ${lightbox.project.description}`}
              </p>
            </div>

            {(lightbox.project.images?.length || 0) > 1 && (
              <>
                <button
                  onClick={prevImage}
                  className="absolute left-4 top-1/2 -translate-y-1/2 flex h-10 w-10 items-center justify-center bg-white/10 text-white hover:bg-white/20 transition-colors"
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>
                <button
                  onClick={nextImage}
                  className="absolute right-4 top-1/2 -translate-y-1/2 flex h-10 w-10 items-center justify-center bg-white/10 text-white hover:bg-white/20 transition-colors"
                >
                  <ChevronRight className="h-5 w-5" />
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
