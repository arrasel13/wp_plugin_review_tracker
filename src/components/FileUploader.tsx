
import { useRef } from 'react';
import { Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from '@/hooks/use-toast';

interface Review {
  date: string;
  rating: number;
  content: string;
  author: string;
  reviewUrl?: string;
  title?: string;
  id?: string;
}

interface PluginData {
  slug: string;
  name?: string;
  reviews: Review[];
  lastUpdated: string;
  totalReviews: number;
}

interface FileUploaderProps {
  onDataUploaded: (data: PluginData[]) => void;
}

const FileUploader = ({ onDataUploaded }: FileUploaderProps) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (file.type !== 'application/json') {
      toast({
        title: "Error",
        description: "Please upload a valid JSON file",
        variant: "destructive",
      });
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const jsonData = JSON.parse(e.target?.result as string);
        
        // Validate the data structure
        if (Array.isArray(jsonData) && jsonData.every(item => 
          item.slug && Array.isArray(item.reviews)
        )) {
          onDataUploaded(jsonData);
          toast({
            title: "Success",
            description: `Uploaded data for ${jsonData.length} plugins`,
          });
        } else {
          throw new Error('Invalid data format');
        }
      } catch (error) {
        toast({
          title: "Error",
          description: "Failed to parse JSON file",
          variant: "destructive",
        });
      }
    };
    
    reader.readAsText(file);
    
    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept=".json"
        onChange={handleFileUpload}
        className="hidden"
      />
      <Button
        variant="outline"
        size="sm"
        onClick={() => fileInputRef.current?.click()}
        className="inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 border border-input bg-background hover:bg-accent hover:text-accent-foreground h-9 rounded-md px-3"
      >
        <Upload className="w-4 h-4" />
      </Button>
    </>
  );
};

export default FileUploader;
