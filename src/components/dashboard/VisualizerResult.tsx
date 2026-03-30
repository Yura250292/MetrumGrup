"use client";

interface VisualizerResultProps {
  originalImage: string;
  generatedImage: string | null;
  description: string;
  items: Array<{
    name: string;
    category: string;
    estimatedPrice: string;
    shopUrl: string;
    shopName: string;
  }>;
}

export function VisualizerResult({
  originalImage,
  generatedImage,
  description,
  items
}: VisualizerResultProps) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <p className="text-sm font-medium mb-2">Оригінальне фото</p>
          <img src={originalImage} alt="Оригінал" className="w-full rounded-lg" />
        </div>
        {generatedImage && (
          <div>
            <p className="text-sm font-medium mb-2">Візуалізація</p>
            <img src={generatedImage} alt="Візуалізація" className="w-full rounded-lg" />
          </div>
        )}
      </div>

      <div className="p-4 bg-muted/50 rounded-lg">
        <p className="text-sm">{description}</p>
      </div>

      {items.length > 0 && (
        <div className="space-y-2">
          <h3 className="font-medium">Рекомендовані товари:</h3>
          {items.map((item, i) => (
            <div key={i} className="p-3 border rounded-lg">
              <p className="font-medium">{item.name}</p>
              <p className="text-sm text-muted-foreground">{item.category}</p>
              <p className="text-sm">{item.estimatedPrice}</p>
              <a
                href={item.shopUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-primary hover:underline"
              >
                {item.shopName}
              </a>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
