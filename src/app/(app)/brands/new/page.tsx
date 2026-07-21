import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { CreateBrandForm } from "./create-brand-form";

export default function NewBrandPage() {
  return (
    <div className="mx-auto max-w-lg space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Create a brand</h1>
        <p className="text-muted-foreground">
          Each brand is an isolated workspace with its own keywords,
          competitors, and content.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Brand details</CardTitle>
          <CardDescription>You&apos;ll be the owner of this brand.</CardDescription>
        </CardHeader>
        <CardContent>
          <CreateBrandForm />
        </CardContent>
      </Card>
    </div>
  );
}
