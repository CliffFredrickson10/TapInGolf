import { useState, useEffect } from "react";
import { useLocation, useParams } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useCreatePortalClub, useUpdatePortalClub, useGetPortalClub, getListPortalClubsQueryKey, getGetPortalClubQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { ChevronLeft } from "lucide-react";
import { Link } from "wouter";
import { ClubProfileInputLayoutType } from "@workspace/api-client-react/src/generated/api.schemas";

const formSchema = z.object({
  name: z.string().min(1, "Name is required"),
  layout_type: z.enum(["18-Hole", "9-Hole"]),
  total_holes: z.coerce.number().min(9),
  config: z.object({
    am_start: z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, "Format HH:MM"),
    am_end: z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, "Format HH:MM"),
    pm_start: z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, "Format HH:MM"),
    pm_end: z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, "Format HH:MM"),
    twilight_start: z.string().optional().nullable(),
    twilight_end: z.string().optional().nullable(),
    interval_minutes: z.coerce.number().min(1),
    allow_18hole_booking: z.boolean(),
  })
});

type FormValues = z.infer<typeof formSchema>;

export default function ClubForm() {
  const params = useParams();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const isEdit = !!params.id && params.id !== "new";
  const clubId = isEdit ? Number(params.id) : undefined;

  const { data: club, isLoading: isLoadingClub } = useGetPortalClub(clubId!, {
    query: {
      enabled: isEdit,
      queryKey: getGetPortalClubQueryKey(clubId!),
    }
  });

  const createClub = useCreatePortalClub();
  const updateClub = useUpdatePortalClub();

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      layout_type: "18-Hole",
      total_holes: 18,
      config: {
        am_start: "06:00",
        am_end: "11:50",
        pm_start: "12:00",
        pm_end: "16:00",
        twilight_start: "",
        twilight_end: "",
        interval_minutes: 10,
        allow_18hole_booking: false,
      }
    }
  });

  useEffect(() => {
    if (club) {
      form.reset({
        name: club.name,
        layout_type: club.layout_type as any,
        total_holes: club.total_holes,
        config: {
          ...club.config,
          twilight_start: club.config.twilight_start || "",
          twilight_end: club.config.twilight_end || "",
        }
      });
    }
  }, [club, form]);

  const onSubmit = (data: FormValues) => {
    // Transform empty strings to null for twilight
    const formattedData = {
      ...data,
      layout_type: data.layout_type as ClubProfileInputLayoutType,
      config: {
        ...data.config,
        twilight_start: data.config.twilight_start || null,
        twilight_end: data.config.twilight_end || null,
      }
    };

    if (isEdit) {
      updateClub.mutate({ clubId: clubId!, data: formattedData }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetPortalClubQueryKey(clubId!) });
          queryClient.invalidateQueries({ queryKey: getListPortalClubsQueryKey() });
          toast({ title: "Club updated successfully" });
          setLocation("/clubs");
        },
        onError: () => {
          toast({ title: "Failed to update club", variant: "destructive" });
        }
      });
    } else {
      createClub.mutate({ data: formattedData }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListPortalClubsQueryKey() });
          toast({ title: "Club created successfully" });
          setLocation("/clubs");
        },
        onError: () => {
          toast({ title: "Failed to create club", variant: "destructive" });
        }
      });
    }
  };

  if (isEdit && isLoadingClub) return <div className="p-8">Loading...</div>;

  return (
    <div className="p-8 max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="outline" size="icon" asChild>
          <Link href="/clubs"><ChevronLeft className="h-4 w-4" /></Link>
        </Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">
            {isEdit ? "Edit Club" : "New Club"}
          </h1>
          <p className="text-muted-foreground mt-1">Configure club profile and tee sheet rules.</p>
        </div>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <Card>
            <CardHeader><CardTitle>Basic Information</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Club Name</FormLabel>
                    <FormControl><Input {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="layout_type"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Layout Type</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="18-Hole">18-Hole</SelectItem>
                          <SelectItem value="9-Hole">9-Hole</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="total_holes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Total Holes</FormLabel>
                      <FormControl><Input type="number" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Tee Sheet Configuration</CardTitle></CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="config.interval_minutes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Tee Time Interval (minutes)</FormLabel>
                      <FormControl><Input type="number" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid grid-cols-2 gap-4 border-t pt-4">
                <FormField
                  control={form.control}
                  name="config.am_start"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>AM Session Start (HH:MM)</FormLabel>
                      <FormControl><Input {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="config.am_end"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>AM Session End (HH:MM)</FormLabel>
                      <FormControl><Input {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid grid-cols-2 gap-4 border-t pt-4">
                <FormField
                  control={form.control}
                  name="config.pm_start"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>PM Session Start (HH:MM)</FormLabel>
                      <FormControl><Input {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="config.pm_end"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>PM Session End (HH:MM)</FormLabel>
                      <FormControl><Input {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid grid-cols-2 gap-4 border-t pt-4">
                <FormField
                  control={form.control}
                  name="config.twilight_start"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Twilight Start (Optional)</FormLabel>
                      <FormControl><Input {...field} value={field.value || ""} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="config.twilight_end"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Twilight End (Optional)</FormLabel>
                      <FormControl><Input {...field} value={field.value || ""} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="border-t pt-4">
                <FormField
                  control={form.control}
                  name="config.allow_18hole_booking"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                      <div className="space-y-0.5">
                        <FormLabel className="text-base">Allow 18-hole booking on 9-hole layout</FormLabel>
                        <p className="text-sm text-muted-foreground">
                          Automatically locks a second slot 2h10m later for the back 9.
                        </p>
                      </div>
                      <FormControl>
                        <Switch checked={field.value} onCheckedChange={field.onChange} />
                      </FormControl>
                    </FormItem>
                  )}
                />
              </div>
            </CardContent>
          </Card>

          <div className="flex justify-end gap-4">
            <Button variant="outline" type="button" asChild>
              <Link href="/clubs">Cancel</Link>
            </Button>
            <Button type="submit" disabled={createClub.isPending || updateClub.isPending}>
              {isEdit ? "Save Changes" : "Create Club"}
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}
