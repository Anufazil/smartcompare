'use client';
import * as Dialog from '@radix-ui/react-dialog';
import { LocateFixed, MapPin, X } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { cities, type UserLocation } from '@smartcompare/shared';
const schema = z.object({
  pincode: z.string().regex(/^[1-9]\d{5}$/, 'Enter a valid 6-digit Indian pincode'),
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
});
export function LocationDialog({
  open,
  onOpenChange,
  location,
  label,
  onSave,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  location: UserLocation;
  label: string;
  onSave: (v: UserLocation, name: string) => void;
}) {
  const [error, setError] = useState(''),
    [locating, setLocating] = useState(false);
  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { ...location, pincode: location.pincode ?? '' },
  });
  function save(value: z.infer<typeof schema>) {
    const city = cities.find((c) => c.pincode.slice(0, 3) === value.pincode.slice(0, 3));
    if (!city && value.lat === location.lat && value.lng === location.lng) {
      setError('For this pincode, enter latitude and longitude under manual coordinates.');
      return;
    }
    onSave(
      city ? { ...value, lat: city.lat, lng: city.lng } : value,
      city?.name ?? `Pincode ${value.pincode}`,
    );
    onOpenChange(false);
  }
  function locate() {
    if (!navigator.geolocation) {
      setError('Enter your location manually. Geolocation is unavailable.');
      return;
    }
    setLocating(true);
    setError('');
    navigator.geolocation.getCurrentPosition(
      (p) => {
        onSave({ lat: p.coords.latitude, lng: p.coords.longitude }, 'Current location');
        setLocating(false);
        onOpenChange(false);
      },
      () => {
        setLocating(false);
        setError('Location permission was unavailable. Enter your location manually.');
      },
      { timeout: 8000, maximumAge: 300000 },
    );
  }
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="dialog-content">
          <Dialog.Close className="icon-button dialog-close" aria-label="Close location">
            <X />
          </Dialog.Close>
          <span className="eyebrow">A LITTLE CLOSER TO YOUR DOOR</span>
          <Dialog.Title>Where are we comparing?</Dialog.Title>
          <Dialog.Description>
            Prices, stock and delivery depend on your location. Currently: {label}.
          </Dialog.Description>
          <button className="button locate-button" onClick={locate} disabled={locating}>
            <LocateFixed size={18} />
            {locating ? 'Finding your location…' : 'Use my current location'}
          </button>
          <div className="city-grid">
            {cities.map((c) => (
              <button
                className="city-button"
                key={c.name}
                onClick={() => {
                  setValue('pincode', c.pincode);
                  setValue('lat', c.lat);
                  setValue('lng', c.lng);
                }}
              >
                <MapPin size={14} />
                {c.name}
              </button>
            ))}
          </div>
          <form className="location-form" onSubmit={handleSubmit(save)}>
            <label>
              Pincode
              <input inputMode="numeric" maxLength={6} {...register('pincode')} />
            </label>
            {errors.pincode && <p className="field-error">{errors.pincode.message}</p>}
            <details>
              <summary>Set coordinates manually</summary>
              <div className="coordinate-grid">
                <label>
                  Latitude
                  <input type="number" step="any" {...register('lat')} />
                </label>
                <label>
                  Longitude
                  <input type="number" step="any" {...register('lng')} />
                </label>
              </div>
              <p className="muted">
                For an unlisted pincode, enter its coordinates for accurate matching.
              </p>
            </details>
            {(errors.lat || errors.lng || error) && (
              <p className="field-error" role="alert">
                {error || 'Check the coordinates.'}
              </p>
            )}
            <button className="button lime full-width" type="submit">
              Save location <MapPin size={18} />
            </button>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
