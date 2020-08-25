const axios = require('axios')
const HttpStatus = require('http-status-codes')
const WikiHelper = require('../utils/wikis-helper')
const HANDLER = require('../utils/response-helper')
const { changeFileOnRemote, addPageToIndex, fetchPagesIndex, updatePagesIndex, getOpts, getOrgId } = WikiHelper

const clientId = process.env.GITHUB_OAUTH_APP_CLIENTID
const clientSecret = process.env.GITHUB_OAUTH_APP_CLIENTSECRET

const githubAPI = 'https://api.github.com'
let accessToken = null

module.exports = {

  getWikis: async (req, res, next) => {
    try {
      if (!accessToken) {
        res.status(HttpStatus.OK).json({ wikis: 'NO_ACCESS_TOKEN' })
      } else {
        res.status(HttpStatus.OK).json({ wikis: await addPageToIndex(await fetchPagesIndex(), 'Home') })
      }
    } catch (error) {
      HANDLER.handleError(res, error)
    }
  },

  getPage: async (req, res, next) => {
    try {
      let { title, ref } = req.query
      if (!ref) {
        ref = 'master'
      }
      console.log(title)
      res.status(HttpStatus.OK).json({ wikis: await addPageToIndex(await fetchPagesIndex(), title, ref) })
    } catch (err) {
      res.status(HttpStatus.BAD_REQUEST).json({ Error: err.message })
    }
  },

  editPage: async (req, res, next) => {
    const { title, content, comments } = req.body
    try {
      await changeFileOnRemote(title, content, `${title} changes - ${comments}`)
      if (title !== '_Sidebar') {
        res.status(HttpStatus.OK).json({ wikis: await addPageToIndex(await fetchPagesIndex(), title) })
      } else {
        await updatePagesIndex()
        res.status(HttpStatus.OK).json({ wikis: await addPageToIndex(await fetchPagesIndex(), 'Home') })
      }
    } catch (err) {
      res.status(HttpStatus.BAD_REQUEST).json({ Error: err.message })
    }
  },

  deletePage: async (req, res, next) => {
    console.log(getOrgId())
    const { title } = req.body
    try {
      const data = {
        message: `${title} deleted`,
        sha: (await axios.get(`${githubAPI}/repos/${getOrgId()}/Donut-wikis-backup/contents/${title}.md`, getOpts())).data.sha
      }
      const deleteCommit = (await axios.delete(`${githubAPI}/repos/${getOrgId()}/Donut-wikis-backup/contents/${title}.md`, {
        data: data,
        headers: getOpts().headers
      })).data.commit.sha
      const issueNumber = await WikiHelper.getFileIssueNumber(title)
      await axios.post(`${githubAPI}/repos/${getOrgId()}/Donut-wikis-backup/issues/${issueNumber}/comments`, { body: deleteCommit }, getOpts())
      await axios.patch(`${githubAPI}/repos/${getOrgId()}/Donut-wikis-backup/issues/${issueNumber}`, { title: `${title}-deleted-${deleteCommit.substring(0, 8)}` }, getOpts())
      await updatePagesIndex()
      await WikiHelper.clearPageFromCache(title)
      res.status(HttpStatus.OK).json({ wikis: await addPageToIndex(await fetchPagesIndex(), 'Home') })
    } catch (err) {
      res.status(HttpStatus.BAD_REQUEST).json({ Error: err.message })
    }
  },

  newPage: async (req, res, next) => {
    const { title, content, comments } = req.body
    try {
      await changeFileOnRemote(title, content, `${title} initial commit - ${comments}`, true)
      await updatePagesIndex()
      res.status(HttpStatus.OK).json({ wikis: await addPageToIndex(await fetchPagesIndex(), title) })
    } catch (err) {
      res.status(HttpStatus.BAD_REQUEST).json({ Error: err.message })
    }
  },

  oauthCheck: async (req, res, next) => {
    console.log(accessToken)
    if (!accessToken) {
      console.log('redirected to github auth')
      res.status(HttpStatus.OK).json({
        redirect: true,
        redirect_url: `https://github.com/login/oauth/authorize?client_id=${clientId}&scope=repo`
      })
    } else {
      res.redirect(`${process.env.clientbaseurl}/wikis`)
    }
  },

  oauthCallback: async (req, res, next) => {
    const body = {
      client_id: clientId,
      client_secret: clientSecret,
      code: req.query.code
    }
    const opts = { headers: { accept: 'application/json' } }
    try {
      const resp = await axios.post('https://github.com/login/oauth/access_token', body, opts)
      accessToken = resp.data.access_token
      WikiHelper.setOpts(accessToken)
      await WikiHelper.getOrg()
      await WikiHelper.createRepo()
      await updatePagesIndex()
      res.redirect(`${process.env.clientbaseurl}/wikis`)
    } catch (err) {
      res.status(500).json({ message: err.message })
    }
  }
}
