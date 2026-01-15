import { useState } from 'react';
import { View, StyleSheet, FlatList, RefreshControl, Pressable, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useTheme } from '../../lib/ThemeContext';
import { Heading, BodyText, Card, PressableCard, Button, Label, Caption } from '../../components/ui';
import { spacing, borderRadius } from '../../lib/theme';
import { usePrototypes, getScreenshotUrl, type Prototype } from '../../hooks/usePrototypes';
import { useTeamStore, useActiveTeam, useTeams } from '../../stores/teamStore';
import { formatDistanceToNow } from '../../lib/utils/dateUtils';

export default function ProjectsScreen() {
  const { theme } = useTheme();
  const activeTeam = useActiveTeam();
  const teams = useTeams();
  const setActiveTeam = useTeamStore((state) => state.setActiveTeam);

  const { data: prototypes, isLoading, refetch, isRefetching } = usePrototypes();

  const handleProjectPress = (prototype: Prototype) => {
    router.push(`/project/${prototype.id}`);
  };

  const handleCreatePress = () => {
    router.push('/(tabs)/create');
  };

  const renderProjectCard = ({ item }: { item: Prototype }) => {
    const screenshotUrl = getScreenshotUrl(item);
    const isWeb = item.framework === 'web_nextjs_react';
    const isPublic = item.visibility === 'PUBLIC';

    return (
      <PressableCard
        style={styles.projectCard}
        onPress={() => handleProjectPress(item)}
      >
        {/* Screenshot */}
        <View style={[styles.screenshotContainer, { backgroundColor: theme.colors.muted }]}>
          {screenshotUrl ? (
            <Image
              source={{ uri: screenshotUrl }}
              style={styles.screenshot}
              resizeMode="cover"
            />
          ) : (
            <View style={styles.screenshotPlaceholder}>
              <BodyText muted size="2xl">
                {isWeb ? '🌐' : '📱'}
              </BodyText>
            </View>
          )}
        </View>

        {/* Project Info */}
        <View style={styles.projectInfo}>
          <Label weight="semibold" numberOfLines={1}>
            {item.name}
          </Label>
          <Caption>
            Updated {formatDistanceToNow(item.updated_at)}
          </Caption>
          <View style={styles.projectMeta}>
            <Caption>
              {isWeb ? '🌐 Web' : '📱 Mobile'}
            </Caption>
            <Caption>
              {isPublic ? '👁 Public' : '🔒 Private'}
            </Caption>
          </View>
        </View>
      </PressableCard>
    );
  };

  const renderEmptyState = () => (
    <Card variant="outline" style={styles.emptyState}>
      <View style={styles.emptyContent}>
        <Heading size="lg" center>
          No projects yet
        </Heading>
        <BodyText muted center style={styles.emptyText}>
          Create your first project to get started
        </BodyText>
        <Button variant="primary" onPress={handleCreatePress}>
          Create Project
        </Button>
      </View>
    </Card>
  );

  const renderHeader = () => (
    <View style={styles.header}>
      <View style={styles.headerTop}>
        <Heading size="3xl">Projects</Heading>
        {teams.length > 1 && (
          <TeamSwitcher
            teams={teams}
            activeTeam={activeTeam}
            onSelectTeam={setActiveTeam}
          />
        )}
      </View>
      <BodyText muted>
        {activeTeam?.personal_owner_user_id ? 'Your personal projects' : activeTeam?.name}
      </BodyText>
    </View>
  );

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: theme.colors.background }]}
      edges={['bottom']}
    >
      <FlatList
        data={prototypes}
        renderItem={renderProjectCard}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={renderHeader}
        ListEmptyComponent={!isLoading ? renderEmptyState : null}
        numColumns={1}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={refetch}
            tintColor={theme.colors.primary}
          />
        }
        showsVerticalScrollIndicator={false}
      />
    </SafeAreaView>
  );
}

// Team Switcher Component
import { Team } from '../../stores/teamStore';

interface TeamSwitcherProps {
  teams: Team[];
  activeTeam: Team | null;
  onSelectTeam: (team: Team) => void;
}

function TeamSwitcher({ teams, activeTeam, onSelectTeam }: TeamSwitcherProps) {
  const { theme } = useTheme();
  const [isOpen, setIsOpen] = useState(false);

  const getTeamDisplayName = (team: Team) => {
    return team.personal_owner_user_id ? 'Personal' : team.name;
  };

  return (
    <View>
      <Pressable
        style={[styles.teamSwitcher, { borderColor: theme.colors.border }]}
        onPress={() => setIsOpen(!isOpen)}
      >
        <Label>{activeTeam ? getTeamDisplayName(activeTeam) : 'Select Team'}</Label>
        <BodyText muted>▼</BodyText>
      </Pressable>

      {isOpen && (
        <View style={[styles.teamDropdown, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}>
          {teams.map((team) => (
            <Pressable
              key={team.id}
              style={[
                styles.teamOption,
                team.id === activeTeam?.id && { backgroundColor: theme.colors.accent },
              ]}
              onPress={() => {
                onSelectTeam(team);
                setIsOpen(false);
              }}
            >
              <Label>{getTeamDisplayName(team)}</Label>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  listContent: {
    padding: spacing[4],
    gap: spacing[4],
  },
  header: {
    marginBottom: spacing[4],
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  teamSwitcher: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    paddingVertical: spacing[2],
    paddingHorizontal: spacing[3],
    borderRadius: borderRadius.lg,
    borderWidth: 1,
  },
  teamDropdown: {
    position: 'absolute',
    top: 44,
    right: 0,
    minWidth: 150,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    overflow: 'hidden',
    zIndex: 100,
  },
  teamOption: {
    paddingVertical: spacing[3],
    paddingHorizontal: spacing[4],
  },
  projectCard: {
    marginBottom: spacing[3],
  },
  screenshotContainer: {
    height: 160,
    borderRadius: borderRadius.md,
    overflow: 'hidden',
    marginBottom: spacing[3],
  },
  screenshot: {
    width: '100%',
    height: '100%',
  },
  screenshotPlaceholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  projectInfo: {
    gap: spacing[1],
  },
  projectMeta: {
    flexDirection: 'row',
    gap: spacing[3],
    marginTop: spacing[1],
  },
  emptyState: {
    marginTop: spacing[8],
  },
  emptyContent: {
    alignItems: 'center',
    padding: spacing[6],
    gap: spacing[3],
  },
  emptyText: {
    marginBottom: spacing[2],
  },
});
