export type DrawerEntity = {
  type: string;
  id: string;
};

export type DrawerStackItem = DrawerEntity & {
  uid: string;
  breadcrumbLabel?: string;
};

export type RendererProps = {
  id: string;
};
