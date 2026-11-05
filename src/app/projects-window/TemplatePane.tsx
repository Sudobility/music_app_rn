/**
 * The desktop Projects window's Template pane — new here; neither phone/
 * tablet nor the macOS File menu has offered a template picker before now.
 * Over `music_lib`'s `projectTemplates`, the same catalogue and the same
 * per-template `build()` the web dashboard's "New from Template" uses, so a
 * template is the same starting score wherever it is chosen.
 */
import { FlatList } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Text } from '@sudobility/components-rn';
import { PressableCard } from '@/components/controls/PressableCard';
import { projectTemplates } from '@sudobility/music_lib';
import type { ProjectTemplate } from '@sudobility/music_lib';
import { libraryCopy } from '@/config/initialize';
import { useDetailScroll } from '@/components/layout/detail-safe-area';

export type TemplatePaneProps = {
  onChoose: (template: ProjectTemplate) => void;
};

export function TemplatePane({ onChoose }: TemplatePaneProps) {
  const { t } = useTranslation();
  const templates = projectTemplates(libraryCopy.templates());
  // Vertically scrollable: full-bleed with a scroll inset and safe-area sides,
  // from the one rule — see `useDetailScroll`.
  const detail = useDetailScroll({ gap: 8 });

  return (
    <FlatList
      {...detail}
      data={templates}
      keyExtractor={(template: ProjectTemplate) => template.id}
      accessibilityLabel={t('dashboard.newFromTemplateAction')}
      renderItem={({ item }: { item: ProjectTemplate }) => {
        const choose = () => onChoose(item);
        return (
          <PressableCard label={item.name} onPress={choose}>
            <Text className="text-foreground font-medium">{item.name}</Text>
            <Text className="text-muted-foreground text-sm">
              {item.description}
            </Text>
          </PressableCard>
        );
      }}
    />
  );
}
