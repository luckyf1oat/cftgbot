/**
 * 简单 URL 路由器
 */
export default class Router {
  constructor() {
    this.routes = [];
  }

  get(path, handler) {
    this.routes.push({ method: 'GET', path, handler });
    return this;
  }

  post(path, handler) {
    this.routes.push({ method: 'POST', path, handler });
    return this;
  }

  put(path, handler) {
    this.routes.push({ method: 'PUT', path, handler });
    return this;
  }

  delete(path, handler) {
    this.routes.push({ method: 'DELETE', path, handler });
    return this;
  }

  /**
   * 匹配路由并执行处理函数
   * @param {Request} request
   * @param {Object} env
   * @returns {Promise<Response|null>} 匹配到路由返回 Response，否则返回 null
   */
  async resolve(request, env) {
    var url = new URL(request.url);
    var method = request.method;
    var path = url.pathname;

    for (var i = 0; i < this.routes.length; i++) {
      var route = this.routes[i];
      if (route.method !== method) continue;

      var params = this.matchPath(route.path, path);
      if (params !== null) {
        return await route.handler(request, env, url, params);
      }
    }

    return null;
  }

  /**
   * 匹配路径，支持 :param 和 * 通配符
   */
  matchPath(routePath, requestPath) {
    // 把路由路径转成正则
    var routeParts = routePath.split('/');
    var requestParts = requestPath.split('/');

    if (routeParts.length !== requestParts.length) {
      // 检查是否有通配符
      if (routeParts[routeParts.length - 1] === '*') {
        if (requestParts.length < routeParts.length - 1) return null;
      } else {
        return null;
      }
    }

    var params = {};

    for (var i = 0; i < routeParts.length; i++) {
      if (routeParts[i] === '*') {
        // 通配符，匹配剩余所有
        params.wildcard = requestParts.slice(i).join('/');
        return params;
      }

      if (routeParts[i].startsWith(':')) {
        // 参数匹配
        var paramName = routeParts[i].slice(1);
        params[paramName] = requestParts[i];
        continue;
      }

      if (routeParts[i] !== requestParts[i]) {
        return null;
      }
    }

    return params;
  }
}