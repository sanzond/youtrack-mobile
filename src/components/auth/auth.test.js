import Auth from './auth';
import sinon from 'sinon';

describe('Auth', function () {
  let configMock;
  let authParamsMock;
  let requests;
  let clock;
  let auth;

  const getLastRequest = () => requests[requests.length - 1];

  const mockConfigLoading = auth => sinon.stub(auth, 'getCachedAuthParams').returns(Promise.resolve(authParamsMock));
  const mockConfigSaving = auth => sinon.stub(auth, 'cacheAuthParams', (authParams) => authParams);

  beforeEach(() => {
    jest.restoreAllMocks();
  });

  beforeEach(() => {
    requests = [];

    clock = sinon.useFakeTimers();

    configMock = {
      backendUrl: 'http://fake-backend-url.ru',
      auth: {
        serverUri: 'http://fake-hub.ru',
        clientId: 'client-id',
        clientSecret: 'client-secret',
        youtrackServiceId: 'yt-service-id',
        scopes: 'scope1 scope2',
        landingUrl: 'ytoauth://landing.url'
      }
    };

    authParamsMock = {
      access_token: 'fake-access-token',
      refresh_token: 'fake-refresh-token',
      token_type: 'bearer'
    };

    global.fetch = sinon.spy(function (url, options) {
      return new Promise(function (resolve, reject) {
        const request = {
          url: url,
          options: options,
          requestBody: options.body,
          resolve: resolve,
          reject: reject
        };
        global.fetch.onRequest(request);
        requests.push(request);
      });
    });

    global.fetch.onRequest = () => {};
  });

  afterEach(function () {
    delete global.fetch;
    clock.restore();
  });

  it('should be imported', () => Auth.should.be.defined);

  it('should create OAuth instance', () => {
    auth = createAuthMock();
    auth.should.be.defined;
  });

  describe('working with auth instance', () => {
    beforeEach(() => {
      auth = createAuthMock();
      mockConfigLoading(auth);
      mockConfigSaving(auth);
    });

    it('should try to load current user to verify token', () => {
      auth.verifyToken(authParamsMock);

      getLastRequest().url.should.contain('api/rest/users/me?fields=');
    });

    it('should provide authorization params when trying to verify token', () => {
      auth.verifyToken(authParamsMock);

      getLastRequest().options.headers.Authorization.should
        .equal(`${authParamsMock.token_type} ${authParamsMock.access_token}`);
    });

    it('should complete verification successfully if hub responded', () => {
      const promise = auth.verifyToken(authParamsMock);

      getLastRequest().resolve({
        status: 200,
        json: () => ({
          id: 'fake-user'
        })
      });

      return promise.should.be.fulfilled;
    });

    it('should fail verification if hub responded with error', () => {
      const promise = auth.verifyToken(authParamsMock);

      getLastRequest().resolve({status: 403});

      return promise.should.be.rejected;
    });

    it('should perform token refresh if it`s expired', () => {
      const promise = auth.verifyToken(authParamsMock);
      sinon.stub(auth, 'refreshToken').returns(Promise.resolve({}));

      getLastRequest().resolve({status: 401});

      return promise.should.be.fulfilled;
    });

    it('should refresh token from hub', async () => {
      const response = {access_token: 'new-token', refresh_token: 'new-refresh'};

      global.fetch.onRequest = options => {
        if (options.url.includes('/api/rest/oauth2/token')) {
          return options.resolve({status: 200, json: () => (response)});
        }
        options.resolve({status: 200, json: () => ({})});
      };

      const authParams = await auth.refreshToken();

      authParams.should.deep.equal(response);
      auth.authParams.should.equal(authParams);
    });

    it('should fail refresh if hub ', () => {
      const response = {error_code: 500};
      const promise = auth.refreshToken();

      global.fetch.onRequest = options => {
        if (options.url.includes('/api/rest/oauth2/token')) {
          return options.resolve({status: 200, json: () => (response)});
        }
        options.resolve({status: 200, json: () => ({})});
      };

      return promise.should.be.rejected;
    });

    it('should authorize via login/password', () => {
      Auth.obtainTokenByCredentials('log', 'pass', configMock);

      const request = getLastRequest();

      request.url.should.equal(`${configMock.auth.serverUri}/api/rest/oauth2/token`);
      request.requestBody.should.equal(`grant_type=password&access_type=offline&username=log&password=pass&scope=scope1%20scope2`);
      request.options.headers.Authorization.should.equal('Basic Y2xpZW50LWlkOmNsaWVudC1zZWNyZXQ=');
      request.options.headers['Content-Type'].should.equal('application/x-www-form-urlencoded');
    });

    it('should encode params when authorizing via login/password', () => {
      Auth.obtainTokenByCredentials('lo$g', 'pa%ss', configMock);

      const request = getLastRequest();
      request.requestBody.should.equal(`grant_type=password&access_type=offline&username=lo%24g&password=pa%25ss&scope=scope1%20scope2`);
    });

    it('should authorize OAuth2 code', () => {
      const oauthCodeMock = 'fake-code';
      Auth.obtainTokenByOAuthCode(oauthCodeMock, configMock);

      const request = getLastRequest();

      request.options.method.should.equal('POST');
      request.url.should.equal(`${configMock.auth.serverUri}/api/rest/oauth2/token`);
      request.options.headers.Authorization.should.equal('Basic Y2xpZW50LWlkOmNsaWVudC1zZWNyZXQ=');
      request.requestBody.should.equal(`grant_type=authorization_code&code=${oauthCodeMock}&client_id=client-id&client_secret=client-secret&redirect_uri=ytoauth://landing.url`);
    });
  });


  function createAuthMock() {
    return new Auth(configMock);
  }
});

