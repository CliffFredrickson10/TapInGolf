import { useState } from "react";
import { useParams, Link } from "wouter";
import { format } from "date-fns";
import { 
  useGetPortalClub, 
  useGetPortalTeeSheet, 
  useGeneratePortalTeeSheet,
  useUpdateTeeSlot,
  useBookTeeSlot,
  useListSlotBookings,
  useCancelSlotBooking,
  getGetPortalTeeSheetQueryKey,
  getGetPortalClubQueryKey,
  getListSlotBookingsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Separator } from "@/components/ui/separator";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { ChevronLeft, Calendar as CalendarIcon, UserPlus, Trash2, Phone, Mail } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const bookingSchema = z.object({
  player_name: z.string().min(1, "Name is required"),
  player_email: z.string().email().optional().or(z.literal("")),
  player_phone: z.string().optional().or(z.literal("")),
});

type BookingFormValues = z.infer<typeof bookingSchema>;

export default function ClubDetail() {
  const params = useParams();
  const clubId = Number(params.id);
  const [date, setDate] = useState<string>(format(new Date(), "yyyy-MM-dd"));
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: club, isLoading: isLoadingClub } = useGetPortalClub(clubId, {
    query: { enabled: !!clubId, queryKey: getGetPortalClubQueryKey(clubId) }
  });

  const { data: teeSheet, isLoading: isLoadingSheet } = useGetPortalTeeSheet(
    { clubId, date },
    { query: { enabled: !!(clubId && date), queryKey: getGetPortalTeeSheetQueryKey({ clubId, date }) } }
  );

  const generateSheet = useGeneratePortalTeeSheet();
  const updateSlot = useUpdateTeeSlot();
  const bookSlot = useBookTeeSlot();
  const cancelBooking = useCancelSlotBooking();

  const handleGenerate = () => {
    generateSheet.mutate({ data: { date } }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetPortalTeeSheetQueryKey({ clubId, date }) });
        toast({ title: "Tee sheet generated successfully" });
      },
      onError: () => {
        toast({ title: "Failed to generate tee sheet", variant: "destructive" });
      }
    });
  };

  const handleToggleActive = (slotId: number, currentActive: boolean) => {
    updateSlot.mutate({ slotId, data: { is_active: !currentActive } }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetPortalTeeSheetQueryKey({ clubId, date }) });
      }
    });
  };

  const getSessionColor = (sessionType: string) => {
    switch (sessionType) {
      case "AM": return "bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-200 border-amber-200 dark:border-amber-800";
      case "PM": return "bg-sky-100 dark:bg-sky-900/30 text-sky-800 dark:text-sky-200 border-sky-200 dark:border-sky-800";
      case "Twilight": return "bg-purple-100 dark:bg-purple-900/30 text-purple-800 dark:text-purple-200 border-purple-200 dark:border-purple-800";
      default: return "bg-muted text-muted-foreground border-border";
    }
  };

  if (isLoadingClub) return <div className="p-8">Loading...</div>;
  if (!club) return <div className="p-8">Club not found</div>;

  return (
    <div className="p-8 flex flex-col h-full space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="outline" size="icon" asChild>
            <Link href="/clubs"><ChevronLeft className="h-4 w-4" /></Link>
          </Button>
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-foreground">{club.name}</h1>
            <p className="text-muted-foreground mt-1">Tee Sheet Management</p>
          </div>
        </div>
        
        <div className="flex items-center gap-4">
          <div className="flex items-center border rounded-md px-3 py-2 bg-card">
            <CalendarIcon className="h-4 w-4 text-muted-foreground mr-2" />
            <input 
              type="date" 
              value={date} 
              onChange={(e) => setDate(e.target.value)}
              className="bg-transparent border-0 text-sm font-medium focus:ring-0 p-0 outline-none cursor-pointer text-foreground"
            />
          </div>
          
          <Button 
            onClick={handleGenerate} 
            disabled={generateSheet.isPending}
            variant="default"
          >
            {generateSheet.isPending ? "Generating..." : "Generate Tee Sheet"}
          </Button>
        </div>
      </div>

      <Card className="flex-1 flex flex-col min-h-0 overflow-hidden border-2 border-border shadow-md">
        <CardHeader className="bg-muted/50 border-b pb-4">
          <CardTitle className="text-lg flex justify-between items-center">
            <span>{format(new Date(date), "EEEE, MMMM d, yyyy")}</span>
            <span className="text-sm font-normal text-muted-foreground">
              {teeSheet?.slots?.length || 0} Slots Available
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="flex-1 p-0 overflow-auto">
          {isLoadingSheet ? (
            <div className="p-8 text-center text-muted-foreground">Loading tee sheet...</div>
          ) : !teeSheet?.slots?.length ? (
            <div className="p-16 flex flex-col items-center justify-center text-center">
              <CalendarIcon className="h-12 w-12 text-muted-foreground/30 mb-4" />
              <h3 className="text-lg font-medium text-foreground">No slots generated</h3>
              <p className="text-muted-foreground mt-1 max-w-sm">
                There are no tee slots generated for this date yet. Click "Generate Tee Sheet" to create them based on the club's configuration.
              </p>
            </div>
          ) : (
            <div className="divide-y">
              {teeSheet.slots.map((slot) => (
                <div 
                  key={slot.id} 
                  className={`flex items-center px-6 py-4 hover:bg-muted/30 transition-colors ${!slot.is_active ? 'opacity-50' : ''}`}
                >
                  <div className="w-24 font-bold text-lg tabular-nums">
                    {slot.tee_time}
                  </div>
                  
                  <div className="w-28">
                    <span className={`text-xs px-2.5 py-1 rounded-full border font-medium ${getSessionColor(slot.session_type)}`}>
                      {slot.session_type}
                    </span>
                  </div>
                  
                  <div className="w-32 text-sm font-medium text-muted-foreground">
                    {slot.tee_start_type}
                  </div>

                  <div className="flex-1 flex items-center justify-center">
                    <div className="flex gap-1.5" title={`${slot.player_count}/${slot.max_players} Players`}>
                      {Array.from({ length: slot.max_players }).map((_, i) => (
                        <div
                          key={i}
                          className={`h-3 w-3 rounded-full transition-colors ${
                            i < slot.player_count 
                              ? 'bg-primary shadow-sm' 
                              : 'bg-muted border border-border'
                          }`}
                        />
                      ))}
                    </div>
                  </div>

                  <div className="w-48 text-xs text-muted-foreground px-4">
                    {(slot.weekday_rate_code || slot.weekend_rate_code) ? (
                      <div className="flex flex-col gap-0.5">
                        {slot.weekday_rate_code && <span>WD: {slot.weekday_rate_code}</span>}
                        {slot.weekend_rate_code && <span>WE: {slot.weekend_rate_code}</span>}
                      </div>
                    ) : null}
                  </div>

                  <div className="w-20 text-center">
                    <Switch 
                      checked={slot.is_active} 
                      onCheckedChange={() => handleToggleActive(slot.id, slot.is_active)}
                    />
                  </div>

                  <div className="w-32 flex justify-end gap-2">
                    <BookingDialog
                      slot={slot}
                      onBook={(data) => {
                        bookSlot.mutate(
                          { slotId: slot.id, data },
                          {
                            onSuccess: () => {
                              queryClient.invalidateQueries({ queryKey: getGetPortalTeeSheetQueryKey({ clubId, date }) });
                              queryClient.invalidateQueries({ queryKey: getListSlotBookingsQueryKey(slot.id) });
                              toast({ title: "Player booked successfully" });
                            },
                            onError: () => toast({ title: "Booking failed", variant: "destructive" })
                          }
                        );
                      }}
                      onCancel={(bookingId) => {
                        cancelBooking.mutate(
                          { slotId: slot.id, bookingId },
                          {
                            onSuccess: () => {
                              queryClient.invalidateQueries({ queryKey: getGetPortalTeeSheetQueryKey({ clubId, date }) });
                              queryClient.invalidateQueries({ queryKey: getListSlotBookingsQueryKey(slot.id) });
                              toast({ title: "Booking cancelled" });
                            },
                            onError: () => toast({ title: "Failed to cancel booking", variant: "destructive" })
                          }
                        );
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function BookingDialog({ slot, onBook, onCancel }: {
  slot: any;
  onBook: (data: BookingFormValues) => void;
  onCancel: (bookingId: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const isFull = slot.player_count >= slot.max_players;

  const { data: bookings, isLoading: isLoadingBookings } = useListSlotBookings(slot.id, {
    query: { enabled: open }
  });

  const form = useForm<BookingFormValues>({
    resolver: zodResolver(bookingSchema),
    defaultValues: { player_name: "", player_email: "", player_phone: "" }
  });

  const onSubmit = (data: BookingFormValues) => {
    onBook(data);
    setOpen(false);
    form.reset();
  };

  const sessionLabel = slot.session_type === "AM" ? "🌅" : slot.session_type === "PM" ? "☀️" : "🌆";

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) form.reset(); }}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <UserPlus className="h-4 w-4 mr-2" />
          {slot.player_count > 0 ? `${slot.player_count}/${slot.max_players}` : "Book"}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {sessionLabel} {slot.tee_time}
            <span className="text-sm font-normal text-muted-foreground ml-1">
              — {slot.tee_start_type}
            </span>
          </DialogTitle>
        </DialogHeader>

        {/* Existing bookings */}
        <div className="space-y-2">
          <p className="text-sm font-medium text-foreground">
            Players ({slot.player_count}/{slot.max_players})
          </p>
          {isLoadingBookings ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : bookings && bookings.length > 0 ? (
            <div className="space-y-2">
              {bookings.map((b) => (
                <div key={b.id} className="flex items-center justify-between rounded-md border px-3 py-2 bg-muted/30">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{b.player_name}</p>
                    <div className="flex items-center gap-3 mt-0.5">
                      {b.player_email && (
                        <span className="flex items-center gap-1 text-xs text-muted-foreground truncate">
                          <Mail className="h-3 w-3 shrink-0" />{b.player_email}
                        </span>
                      )}
                      {b.player_phone && (
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Phone className="h-3 w-3 shrink-0" />{b.player_phone}
                        </span>
                      )}
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 shrink-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                    onClick={() => onCancel(b.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground italic">No players booked yet.</p>
          )}
        </div>

        {!isFull && (
          <>
            <Separator />
            <div>
              <p className="text-sm font-medium text-foreground mb-3">Add a player</p>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3">
                  <FormField
                    control={form.control}
                    name="player_name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Player Name</FormLabel>
                        <FormControl><Input placeholder="Full name" {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <div className="grid grid-cols-2 gap-3">
                    <FormField
                      control={form.control}
                      name="player_email"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Email</FormLabel>
                          <FormControl><Input type="email" placeholder="Optional" {...field} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="player_phone"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Phone</FormLabel>
                          <FormControl><Input type="tel" placeholder="Optional" {...field} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  <div className="flex justify-end gap-3 pt-1">
                    <Button type="button" variant="outline" size="sm" onClick={() => setOpen(false)}>Close</Button>
                    <Button type="submit" size="sm" disabled={!slot.is_active}>
                      <UserPlus className="h-4 w-4 mr-2" />
                      Add Player
                    </Button>
                  </div>
                </form>
              </Form>
            </div>
          </>
        )}

        {isFull && (
          <div className="flex justify-end">
            <Button variant="outline" size="sm" onClick={() => setOpen(false)}>Close</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
