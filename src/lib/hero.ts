// Hero composition — mirrors the engine's brand rules (scripts/lib/image.mjs):
// 1200×675 cover-crop, WebP q82, white logo composited bottom-right.
// The logo is embedded as base64 so the serverless bundle never misses the file.
import sharp from 'sharp';

const HERO_W = 1200, HERO_H = 675, WEBP_QUALITY = 82;
const LOGO_WIDTH = 180, LOGO_MARGIN = 32;

const LOGO_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAALQAAAC0CAYAAAA9zQYyAAAACXBIWXMAAE69AABOvQFzamgUAAAEwElEQVR4nO3dT4hVZRyH8UOBhbbrHxblqk1SIQa1aGG6i2ghtSxooRihFEWbjJhVQi2SihioILBwUZuJamFSlqscEMRNSFGbKENXlpZMT5w6kEmL995533tnvvf5wFnO/b1zznPPHO6fM10nSZIkSZIkSZIkSZIkSZIkSZIkSZIkSZIkSZIkSZLiANcCdwKbR9w2AtdMe/3S34B7gS+AJcZ3ATgIbHC3amqA7cDv1HO6P2N7SDWNmG8CzlHfSeBKD6kmHfQc7Tzo4dSkgz7UMOiXPJyadNCLDYOe93DKoKVxeYZWFINWFINWFINWFINWFINWFINWFINWFINWFINWFINWFINWFINWFINWFINWFINWFINWFINWE8BW4CPg7Jjf3zsz/PyWEef6nULVBbwI/Fnpi6n94+wdYbZBqx7gEdrYXjjfoFXPcIehFk4UzjdoVb0NV0vrC9Zg0KoD2NQ46E0FazBo1THcV7mlzQVrMGjVYdCKYtCKYtCKYtCKYtCKYtCKYtCKYtCKYtCKYtCKYtCKYtCKYtCKYtCKYtCKYtCKYtCKYtCKYtD/BdwBvAocGb4aNsp2bLjRzh5g3WUPrUkw6H8BzwNLlb5L+QNw1yUPr0kw6H8AO6jvR+D6YYQmwaC7fh9cBfxCGy9b8gQZdNfvg220c8qgDbqm+YIn9eO084dBG/Skg95JQwZt0DXNG/QM8Rq68wydxKA7g05i0J1BNwprLfBcf5Nw4PwY14oXgW+BV4AbDNpr6Knp300Cjld+h6robVfP0J1n6AZBf0Z935d8QMagO4OuHPN9tLPboPFlu0kC5hoGvWDQGPSEg36zYdBfGzQGPeGg5xsGvWjQGLRBz9Y/DcLPctTjGdqgoxi0QUcxaIOOYtAGHcWgDTqKQRt0FIM26CgGbdBRDNqgoxi0QUcxaIOOYtAGHcWgDTqKQRt0FIM26CgGbdBRDNqgoxi0QUcxaIOOYtAGHcWgDTqKQRt0FIM26CgGbdBRDNqgoxi0QUcxaIOOYtAGHcWgDTqKQRt0FIM26CgGbdBRDNqgoxi0QUcxaIOOYtAGHcWgDTqKQRt0FIM26CgGbdBRDNqgoxi0QUcxaIOOYtAGHQXY3/Aftx8tmL+Rtm4vWMPRhvP3F8x/rOH837pZAjzZcGe+VTB/HXCh0fzzwNqCNbxDO08UzL+n4fzj3SwB1vfP4kY7c0vhGg42mv9e4fytjeb/CtxYMP8K4JtGa3immzXA0w125LsjzN8AnK48/2fglhHWcID69oww/37gYuX5i8DV3SwCnhrOKMu1BLwGrBlxfn8tfZI6TpRcO182fw3wxrD+5To3SsyXrOEB4Cfq+Bi4rkvSXz8C24AdwM6C7VngfeAw8OWI2+fAB8ALhbP+b9sFvA58Osb8fvtkeDLtWsYa+vV/OPw+o84/3F/mDPtx3Pm7gbeBQ2PMPwIsAPsK5jzan0S61QK4G/iu0rNduQ6M+td0WmdmY1apuW4lGy4zpFKnupUMeLj4V5HgTLeSAbc2eAlIuRa6lQ7YO+29pFXhLHBbtxoADw3vwh0bXmR3cx8sDvvgq+FzPDdPu1NJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJUrd6/AX4GQ+beRcTCQAAAABJRU5ErkJggg==';

async function logoBuffer(): Promise<Buffer> {
  const raw = Buffer.from(LOGO_B64, 'base64');
  return sharp(raw)
    .resize({ width: LOGO_WIDTH })
    .extend({ top: 0, left: 0, right: LOGO_MARGIN, bottom: LOGO_MARGIN, background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
}

/** Cover-crop to the given size (default 1200×675), watermark bottom-right, return WebP buffer. */
export async function composeHero(base: Buffer, watermark = true, width = HERO_W, height = HERO_H): Promise<Buffer> {
  let pipeline = sharp(base).resize(width, height, { fit: 'cover', position: 'centre' });
  if (watermark) {
    try {
      pipeline = pipeline.composite([{ input: await logoBuffer(), gravity: 'southeast' }]);
    } catch {
      /* logo decode failed — ship unwatermarked rather than fail the request */
    }
  }
  return pipeline.webp({ quality: WEBP_QUALITY }).toBuffer();
}
