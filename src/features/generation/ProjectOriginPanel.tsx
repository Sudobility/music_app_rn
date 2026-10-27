/**
 * Where the open project came from, on the property sheet's Score tab.
 *
 * The web panel, row for row. A project's row records only an origin — the
 * job that generated it, the file it was imported from, the recording it was
 * transcribed from, or the project it copies — and everything else is read
 * back from where it already lives: a generated project's request, date,
 * model and token count are on its job (`GET /projects/:id/jobs`), and a
 * duplicate's source name is in the projects list the dashboard already
 * holds. Nothing here fetches a score.
 *
 * The rows for a generated project are the request as it was sent — the
 * brief, not the choices the server rolled from it; those are the
 * `GenerationChoices` panel's, shown beneath this one.
 */
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Text } from '@sudobility/components-rn';
import {
  GENERATION_VARIANT_LABELS,
  keySignatureOptions,
} from '@sudobility/music_types';
import type {
  GenerateScoreRequest,
  GenerationJobDetail,
  ProjectOrigin,
} from '@sudobility/music_types';
import { useProjectJobs, useProjects } from '@sudobility/music_client';
import type { MusicHookContext } from '@sudobility/music_client';
import {
  complexityLabelKey,
  moodLabelKey,
  styleLabelKey,
} from '@sudobility/music_lib';

export type ProjectOriginProps = {
  /** Null for a project written before origins were recorded. */
  origin: ProjectOrigin | null;
  projectId: string;
  /**
   * What the hooks need to ask the server for a job or a source project's
   * name. Handed in by the screen rather than read from the auth layer here,
   * so the property sheet stays renderable without one — null means the rows
   * that would ask the server are simply absent rather than failing.
   */
  context: MusicHookContext | null;
};

type Row = readonly [label: string, value: string];

function OriginRows({ rows }: { rows: readonly Row[] }) {
  return (
    <View className="gap-1">
      {rows.map(([label, value]) => (
        <View key={label} className="flex-row items-start gap-2">
          <Text className="text-muted-foreground text-sm">{`${label}:`}</Text>
          <Text className="text-foreground flex-1 text-sm">{value}</Text>
        </View>
      ))}
    </View>
  );
}

/** Whether a job's stored request is a whole-score brief rather than a region's. */
function isScoreRequest(
  request: GenerationJobDetail['request'],
): request is GenerateScoreRequest {
  return 'durationMeasures' in request;
}

/**
 * The request a job was written to, in readable rows, then what the job cost.
 * Pure: handed the job, so it can be rendered and tested without a server.
 */
export function GeneratedOriginDetails({ job }: { job: GenerationJobDetail }) {
  const { t } = useTranslation();
  const rows: Row[] = [];

  if (isScoreRequest(job.request)) {
    const request = job.request;
    rows.push([t('generate.prompt'), request.prompt]);
    if (request.style)
      rows.push([t('generateScore.style'), t(styleLabelKey(request.style))]);
    if (request.mood)
      rows.push([t('generateScore.mood'), t(moodLabelKey(request.mood))]);
    if (request.tempo !== undefined)
      rows.push([
        t('generateScore.tempo'),
        t('projectOrigin.tempoValue', { bpm: request.tempo }),
      ]);
    if (request.keySignature) {
      const { fifths, mode } = request.keySignature;
      const tonic =
        keySignatureOptions(mode).find(option => option.fifths === fifths)
          ?.tonic ?? String(fifths);
      rows.push([t('generateScore.key'), `${tonic} ${t(`key.${mode}`)}`]);
    }
    if (request.timeSignature) {
      const { numerator, denominator } = request.timeSignature;
      rows.push([
        t('generateScore.timeSignature'),
        `${numerator}/${denominator}`,
      ]);
    }
    rows.push([
      t('generateScore.measures'),
      t('projectOrigin.barsValue', { count: request.durationMeasures }),
    ]);
    if (request.tracks.length > 0) {
      rows.push([
        t('projectOrigin.lineup'),
        request.tracks
          .map(track =>
            track.instrumentName && track.instrumentName !== track.name
              ? `${track.name} — ${track.instrumentName}`
              : track.name,
          )
          .join('\n'),
      ]);
    }
    if (request.lyrics && request.lyricsTheme?.trim())
      rows.push([t('newProject.lyricsTheme'), request.lyricsTheme.trim()]);
    if (request.complexity)
      rows.push([
        t('generateScore.complexity'),
        t(complexityLabelKey(request.complexity)),
      ]);
    // A name the server maps to a backend, shown as the picker shows it; an
    // unlisted one is printed as sent rather than hidden.
    const variant = request.variant ?? 'default';
    rows.push([
      t('projectOrigin.backend'),
      variant in GENERATION_VARIANT_LABELS
        ? GENERATION_VARIANT_LABELS[
            variant as keyof typeof GENERATION_VARIANT_LABELS
          ]
        : variant,
    ]);
  }

  rows.push([
    t('projectOrigin.generatedOn'),
    new Date(job.finishedAt ?? job.createdAt).toLocaleString(),
  ]);
  if (job.usage) {
    rows.push([t('projectOrigin.modelUsed'), job.usage.model]);
    rows.push([
      t('projectOrigin.tokens'),
      t('projectOrigin.tokensValue', {
        prompt: job.usage.promptTokens,
        completion: job.usage.completionTokens,
      }),
    ]);
  }

  return <OriginRows rows={rows} />;
}

function GeneratedOrigin({
  context,
  projectId,
  jobId,
}: {
  context: MusicHookContext;
  projectId: string;
  jobId: string;
}) {
  const { t } = useTranslation();
  const jobs = useProjectJobs(context, projectId);
  const job = jobs.data?.find(candidate => candidate.id === jobId);
  if (job) return <GeneratedOriginDetails job={job} />;
  return (
    <Text className="text-muted-foreground text-sm">
      {jobs.isSuccess
        ? t('projectOrigin.jobMissing')
        : t('projectOrigin.jobLoading')}
    </Text>
  );
}

function DuplicatedOrigin({
  context,
  sourceProjectId,
}: {
  context: MusicHookContext;
  sourceProjectId: string;
}) {
  const { t } = useTranslation();
  // The summaries list, never the source project itself: naming it must not
  // download its score.
  const projects = useProjects(context);
  const source = projects.data?.find(project => project.id === sourceProjectId);
  const name = source
    ? source.name
    : projects.isSuccess
      ? t('projectOrigin.sourceMissing')
      : sourceProjectId;
  return <OriginRows rows={[[t('projectOrigin.sourceProject'), name]]} />;
}

export function ProjectOriginPanel({
  origin,
  projectId,
  context,
}: ProjectOriginProps) {
  const { t } = useTranslation();
  return (
    <View className="gap-2" accessibilityLabel={t('projectOrigin.heading')}>
      <Text className="text-foreground text-sm font-semibold">
        {t('projectOrigin.heading')}
      </Text>
      <Text className="text-foreground text-sm">
        {t(`projectOrigin.kind.${origin?.kind ?? 'unknown'}`)}
      </Text>
      {origin?.kind === 'imported' ? (
        <OriginRows
          rows={[
            [
              t('projectOrigin.format'),
              t(`docs.formats.name.${origin.format}`),
            ],
            ...(origin.fileName
              ? [[t('projectOrigin.file'), origin.fileName] as Row]
              : []),
          ]}
        />
      ) : null}
      {origin?.kind === 'transcribed' && origin.fileName ? (
        <OriginRows rows={[[t('projectOrigin.file'), origin.fileName]]} />
      ) : null}
      {origin?.kind === 'duplicated' && context ? (
        <DuplicatedOrigin
          context={context}
          sourceProjectId={origin.sourceProjectId}
        />
      ) : null}
      {origin?.kind === 'generated' && context ? (
        <GeneratedOrigin
          context={context}
          projectId={projectId}
          jobId={origin.jobId}
        />
      ) : null}
    </View>
  );
}
