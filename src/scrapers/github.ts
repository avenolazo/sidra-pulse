import axios from 'axios';
import { ScrapedUpdate, ScraperProvider } from '../types.js';
import { logger } from '../services/logger.js';

const GITHUB_ORG = 'Sidra-Chain';
const REPOS_TO_WATCH = ['SidraChain'];

export class GitHubScraper implements ScraperProvider {
  public readonly name = 'github';

  async scrape(_instances: string[]): Promise<ScrapedUpdate[]> {
    const updates: ScrapedUpdate[] = [];

    for (const repo of REPOS_TO_WATCH) {
      try {
        const releaseUpdates = await this.scrapeReleases(repo);
        updates.push(...releaseUpdates);

        const commitUpdates = await this.scrapeRecentCommits(repo);
        updates.push(...commitUpdates);
      } catch (error) {
        logger.error(`Failed to scrape GitHub repo ${GITHUB_ORG}/${repo}`, error);
      }
    }

    return updates;
  }

  private async scrapeReleases(repo: string): Promise<ScrapedUpdate[]> {
    const url = `https://api.github.com/repos/${GITHUB_ORG}/${repo}/releases?per_page=5`;

    const response = await axios.get(url, {
      headers: {
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'SidraPulse/1.0',
      },
      timeout: 10000,
    });

    return (response.data || []).map((release: any) => ({
      id: `gh_release_${release.id}`,
      title: `Release: ${release.tag_name} — ${release.name || ''}`,
      content: (release.body || release.name || release.tag_name).slice(0, 1000),
      timestamp: release.published_at || release.created_at || new Date().toISOString(),
      url: release.html_url,
      source: this.name,
    }));
  }

  private async scrapeRecentCommits(repo: string): Promise<ScrapedUpdate[]> {
    const url = `https://api.github.com/repos/${GITHUB_ORG}/${repo}/commits?per_page=5`;

    const response = await axios.get(url, {
      headers: {
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'SidraPulse/1.0',
      },
      timeout: 10000,
    });

    return (response.data || []).map((commit: any) => ({
      id: `gh_commit_${commit.sha}`,
      title: `Commit: ${(commit.commit?.message || '').split('\n')[0].slice(0, 80)}`,
      content: commit.commit?.message || '',
      timestamp: commit.commit?.author?.date || new Date().toISOString(),
      url: commit.html_url,
      source: this.name,
    }));
  }
}
