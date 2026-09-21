import brandmark from './assets/brandmark.png';

export const IconLogo = (props: React.SVGProps<SVGSVGElement> & { className?: string }) => {
  const { className, ...rest } = props;
  return (
    <img
      src={brandmark}
      alt="Nocturnal"
      className={className}
      {...(rest as React.ImgHTMLAttributes<HTMLImageElement>)}
    />
  );
};
