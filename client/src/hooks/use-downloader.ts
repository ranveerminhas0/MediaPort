import { useMutation } from "@tanstack/react-query";
import { api, type ExtractInput } from "@shared/routes";
import { useToast } from "@/hooks/use-toast";

export function useExtract() {
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (data: ExtractInput) => {
      const res = await fetch(api.extract.path, {
        method: api.extract.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to extract media");
      }

      const result = await res.json();
      return api.extract.responses[200].parse(result);
    },
    onError: (error) => {
      toast({
        title: "Extraction Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}
