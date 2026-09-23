import { useEffect, useState } from 'react';
import type { CurrentUser } from '../api/client';
import { gravatarUrl, initials } from './avatar-sources';

/**
 * Somebody's face, or the closest we can get to it.
 *
 * The initials are drawn first and a picture is layered over them only once it
 * has actually loaded. Doing it the other way round — render the image, fall
 * back when it fails — leaves an empty circle for as long as the request takes,
 * and Gravatar answering "no picture" is a round trip like any other.
 *
 * Sources in order: the identity provider's picture, then Gravatar, then the
 * initials that were there all along.
 */
export function Avatar({ user, size = 36 }: { user: CurrentUser; size?: number }) {
  const [src, setSrc] = useState<string | null>(user.image);
  const [loaded, setLoaded] = useState(false);
  const [triedGravatar, setTriedGravatar] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoaded(false);

    if (user.image) {
      setSrc(user.image);
      setTriedGravatar(false);
      return;
    }

    // No picture from the provider, so Gravatar is the only thing left to try.
    setTriedGravatar(true);
    void gravatarUrl(user.email).then((url) => {
      if (!cancelled) setSrc(url);
    });

    return () => {
      cancelled = true;
    };
  }, [user.image, user.email]);

  const onError = async () => {
    if (triedGravatar) {
      setSrc(null);
      return;
    }
    setTriedGravatar(true);
    setSrc(await gravatarUrl(user.email));
  };

  return (
    <span className="avatar" style={{ width: size, height: size, fontSize: size * 0.4 }}>
      {!loaded && initials(user.name, user.email)}
      {src && (
        <img
          src={src}
          alt=""
          width={size}
          height={size}
          referrerPolicy="no-referrer"
          hidden={!loaded}
          onLoad={() => setLoaded(true)}
          onError={() => void onError()}
        />
      )}
    </span>
  );
}
