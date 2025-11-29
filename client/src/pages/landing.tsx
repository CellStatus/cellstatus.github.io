import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Factory, LogIn } from "lucide-react";

export default function Landing() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-4">
          <div className="flex items-center justify-center w-12 h-12 rounded-lg bg-primary/10 mx-auto">
            <Factory className="h-6 w-6 text-primary" />
          </div>
          <div className="space-y-2">
            <CardTitle className="text-2xl font-bold text-center">Manufacturing Cell Status Keeper</CardTitle>
            <CardDescription className="text-center">
              Real-time production floor monitoring and machine management
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Track machine status, operator assignments, production metrics, and maintenance logs from your shop floor in real time.
            </p>
            <Button 
              onClick={() => window.location.href = "/api/login"} 
              className="w-full"
              data-testid="button-login"
            >
              <LogIn className="mr-2 h-4 w-4" />
              Sign In
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
